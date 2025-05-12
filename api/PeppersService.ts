import {Pepper} from "../types";

const DEFAULT_PEPPERS = [{
    id: 'P_0',
    pepperText: '\'Agents\' are just sparkling apps',
    upvotes: [],
    creatorID: '-1',
},
{
    id: 'P_1',
    pepperText: 'Microservices was a mistake',
    upvotes: [],
    creatorID: '-1',
},
{
    id: 'P_2',
    pepperText: 'CAPTCHA stops more users than bots',
    upvotes: [],
    creatorID: '-1',
},
{
    id: 'P_3',
    pepperText: 'Python is performant enough',
    upvotes: [],
    creatorID: '-1',
},
{
    id: 'P_4',
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
        if (!peppers) {
            // If no peppers exist, set the id counter to the number of default peppers.
            await this.env.PeppersKV.put(this.organizationID + "_next_id", DEFAULT_PEPPERS.length.toString())
            return this.#set(DEFAULT_PEPPERS)
        }
        console.log(`Fetched ${peppers.length} peppers`)
        return peppers;
    }

    #set = async (peppers: Pepper[]): Promise<Pepper[]> => {
        // Sort the peppers descending first by upvotes then by ID (which has a timestamp)
        const sorted = peppers.sort((t1, t2) => {
            if (t1.upvotes.length !== t2.upvotes.length) {
                return t2.upvotes.length - t1.upvotes.length;
            }
            return t1.id.localeCompare(t2.id);
        });

        await this.env.PeppersKV.put(this.organizationID, JSON.stringify(sorted))
        // see PeppersAPI.ts for what this counter is used for.
        await this.#incrementSseCounter()
        return sorted
    }

    #getIdAndIncrement = async (): Promise<string> => {
        let idCounter = await this.env.PeppersKV.get(this.organizationID + "_next_id")
        if (!idCounter) {
            console.error("No id counter found - we should have set it in the get method. Resetting to default...")
            idCounter = DEFAULT_PEPPERS.length.toString() 
            await this.env.PeppersKV.put(this.organizationID + "_next_id", idCounter)
        }
        this.env.PeppersKV.put(this.organizationID + "_next_id", (parseInt(idCounter) + 1).toString())
        console.log(`Incremented id counter to ${idCounter}`)
        return idCounter
    }

    #incrementSseCounter = async (): Promise<number> => {
        const sseCounter = await this.getSseCounter()
        this.env.PeppersKV.put(this.organizationID + "_sse_counter", (sseCounter + 1).toString())
        console.log(`Incremented sse counter to ${sseCounter}`)
        return sseCounter
    }

    getSseCounter = async (): Promise<number> => {
        const sseCounter = await this.env.PeppersKV.get(this.organizationID + "_sse_counter")
        console.log(`SSE counter: ${sseCounter}`)
        if (!sseCounter) {
            console.info("No sse counter found. Resetting to default...")
            this.env.PeppersKV.put(this.organizationID + "_sse_counter", "1")
            return 1
        }
        return parseInt(sseCounter)
    }
    addPepper = async (pepperText: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const newId = "P_" + await this.#getIdAndIncrement()
        const newPepper: Pepper = {
            id: newId,
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
        const existingPepper = peppers.find(p => p.id === pepperID)
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
        const cleaned = peppers.filter(p => p.id !== existingPepper.id);
        console.log(`Pepper ${pepperID} deleted`)
        return this.#set(cleaned);
    }

    setUpvote = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => {
            if (p.id !== pepperID) {
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
            if (p.id !== pepperID) {
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
        //Reset user roles to default
        //Save pepper state to KV
        // Nuke it all!
        await this.env.PeppersKV.delete(this.organizationID)
        await this.env.PeppersKV.delete(this.organizationID + "_sse_counter")
        await this.env.PeppersKV.delete(this.organizationID + "_next_id")
        // Get with no data resets the peppers`
        console.log(`Deleted ALL peppers`)
        return this.get()
    }
}

export const peppersService = (env: Env, organizationID: string, memberID: string) => new PeppersService(env, organizationID, memberID)