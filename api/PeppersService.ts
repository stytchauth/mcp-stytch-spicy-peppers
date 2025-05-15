import {Pepper} from "../types";
import { v7 as uuidv7 } from 'uuid';
import crypto from 'crypto';

const DEFAULT_PEPPERS = [{
    uuid: '0196c692-df29-7318-ac1d-9fdca34ddc29',
    pepperText: '\'Agents\' are just sparkling apps',
    upvotes: [],
    creatorID: '-1',
},
{
    uuid: '0196c692-df29-7318-ac1d-a2ca8adb15fb',
    pepperText: 'Microservices was a mistake',
    upvotes: [],
    creatorID: '-1',
},
{
    uuid: '0196c692-df29-7318-ac1d-a69b0ccb4ae1',
    pepperText: 'CAPTCHA stops more users than bots',
    upvotes: [],
    creatorID: '-1',
},
{
    uuid: '0196c692-df29-7318-ac1d-a9580a96167c',
    pepperText: 'Python is performant enough',
    upvotes: [],
    creatorID: '-1',
},
{
    uuid: '0196c692-df29-7318-ac1d-ac509c697230',
    pepperText: 'The most useful vim command is \':q\'',
    upvotes: [],
    creatorID: '-1',
},
]

export class PepperUneditableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PepperUneditableError';
        Object.setPrototypeOf(this, PepperUneditableError.prototype);
    }
}

/**
 * The `PeppersService` class provides methods for managing a set of "spicy peppers" backed by Cloudflare KV storage.
 * "spicy peppers" are controversial statements that are upvoted by users to find the spiciest of the peppers.
 * This class manages state peristance and data validation.
 */
class PeppersService {
    constructor(
        private env: Env,
        private organizationID: string,
        private memberID: string,
    ) {
    }

    /** Pepper CRUD */

    get = async (): Promise<Pepper[]> => {
        const peppers = await this.env.PeppersKV.get<Pepper[]>(this.organizationID, "json")
        if (!peppers || peppers.length === 0) {
            // If no peppers exist, set the id counter to the number of default peppers.
            await this.env.PeppersKV.put(this.organizationID + "_next_id", DEFAULT_PEPPERS.length.toString())
            return this.#set(DEFAULT_PEPPERS)
        }
        console.log(`Fetched ${peppers.length} peppers`)
        return peppers;
    }

    getSimplifiedPeppers = async (): Promise<Array<{pepperText: string, upvoteCount: number}>> => {
        const peppers = await this.get();
        return peppers.map(pepper => ({
            pepperText: pepper.pepperText,
            upvoteCount: pepper.upvotes.length
        }));
    }

    #set = async (peppers: Pepper[]): Promise<Pepper[]> => {
        // sort by upvotes and uuid
        const upvoteSorted = peppers.sort((t1, t2) => {
            if (t1.upvotes.length !== t2.upvotes.length) {
                return t2.upvotes.length - t1.upvotes.length;
            }
            return t1.uuid.localeCompare(t2.uuid);
        });

        await this.env.PeppersKV.put(this.organizationID, JSON.stringify(upvoteSorted))
        return upvoteSorted
    }

    getSseCounter = async (): Promise<string> => {
        const str = await this.env.PeppersKV.get(this.organizationID, "text")
        return crypto.createHash('sha256').update(str ?? "").digest('hex')
    }

    addPepper = async (pepperText: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const newPepper: Pepper = {
            uuid: uuidv7(),
            pepperText: pepperText,
            creatorID: this.memberID,
            upvotes: [],
        }
        peppers.push(newPepper)
        console.log(`New pepper added: ${newPepper}`)
        return this.#set(peppers)
    }

    #getPepperIfEditable = async (pepperID: string, canOverrideOwnership: boolean): Promise<Pepper | false> => {
        const peppers = await this.get()
        const existingPepper = peppers.find(p => p.uuid === pepperID)
        if (!existingPepper) {
            console.error(`Pepper ${pepperID} not found - no pepper deleted`)
            return false
        }
        // The pepper can be deleted by any user with deleteOwn permissions
        // AND they own the pepper, OR if the user has overrideOwnership permissions.
        if (existingPepper.creatorID !== this.memberID && !canOverrideOwnership) {
            console.error(`User ${this.memberID} does not have permission to edit pepper ${pepperID} created by ${existingPepper.creatorID}`)
            throw new PepperUneditableError(`User ${this.memberID} does not have permission to edit pepper ${pepperID} created by ${existingPepper.creatorID}`)
        }
        return existingPepper
    }

    deletePepper = async (pepperID: string, canOverrideOwnership: boolean): Promise<Pepper[]> => {
        const peppers = await this.get()
        const existingPepper = await this.#getPepperIfEditable(pepperID, canOverrideOwnership)
        if (!existingPepper) {
            return this.get()
        }
        const cleaned = peppers.filter(p => p.uuid !== existingPepper.uuid);
        console.log(`Pepper ${pepperID} deleted`)
        return this.#set(cleaned);
    }

    setUpvote = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => {
            if (p.uuid !== pepperID) {
                return p
            }
            return {
                ...p,
                // add the memberID to the upvotes array and then remove duplicates
                // to ensure there is one and only one upvote for this member after this call,
                // ensuring idempotency.
                upvotes: [...p.upvotes, {memberID: this.memberID}].reduce((acc, curr) => {
                    if (!acc.some(u => u.memberID === curr.memberID)) {
                        acc.push(curr);
                    }
                    return acc;
                }, [] as {memberID: string}[])
            }
        });
        console.log(`Pepper ${pepperID} upvoted`)
        return this.#set(updated);
    }

    deleteUpvote = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => {
            if (p.uuid !== pepperID) {
                return p
            }
            return {
                ...p,
                // filter out the memberID from the upvotes array so that there
                // will be zero upvotes for this member after this call, ensuring idempotency.
                upvotes: p.upvotes.filter(u => u.memberID !== this.memberID)
            }
        });
        console.log(`Pepper ${pepperID} upvote removed`)
        return this.#set(updated);
    }

    deleteAll = async (): Promise<Pepper[]> => {
        //TODO: Reset user roles to default?
        //Nuke it all!
        await this.env.PeppersKV.delete(this.organizationID)
        await this.env.PeppersKV.delete(this.organizationID + "_sse_counter")
        await this.env.PeppersKV.delete(this.organizationID + "_next_id")
        // First get (with no data for the org) resets the peppers to the hardcoded default`
        console.log(`Deleted ALL peppers`)
        return this.get()
    }
}

export const peppersService = (env: Env, organizationID: string, memberID: string) => new PeppersService(env, organizationID, memberID)