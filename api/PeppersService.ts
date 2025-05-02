import {Pepper} from "../types";

const DEFAULT_PEPPERS = [{
    id: 'pepper_0',
    pepperText: '"Agents" are just sparkling apps',
    upvotes: [
        {
            memberID: '-1',
        }
    ],
    creatorID: '-1',
}]

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
        private canOverrideOwnership: boolean
    ) {
    }

    /** Pepper CRUD */

    get = async (): Promise<Pepper[]> => {
        const peppers = await this.env.PeppersKV.get<Pepper[]>(this.organizationID, "json")
        if (!peppers) {
            return this.#set(DEFAULT_PEPPERS)
        }
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
        return sorted
    }

    addPepper = async (pepperText: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const newPepper: Pepper = {
            id: `pepper_${Date.now().toString()}`, //Assume that this will be unique, which in general is not true, but close enough for this use case.
            pepperText: pepperText,
            creatorID: this.memberID,
            upvotes: [],
        }
        peppers.push(newPepper)
        console.log(newPepper)
        return this.#set(peppers)
    }

    #getPepperIfEditable = async (pepperID: string): Promise<Pepper | false> => {
        const peppers = await this.get()
        const existingPepper = peppers.find(p => p.id === pepperID)
        if (!existingPepper) {
            console.error(`Pepper ${pepperID} not found - no pepper deleted`)
            return false
        }
        // The pepper can be deleted by any user with deleteOwn permissions
        // AND they own the pepper, OR if the user has overrideOwnership permissions.
        if (existingPepper.creatorID !== this.memberID && !this.canOverrideOwnership) {
            console.error(`User ${this.memberID} not have permission to delete pepper ${pepperID} created by ${existingPepper.creatorID}`)
            return false
        }
        return existingPepper
    }

    deletePepper = async (pepperID: string): Promise<Pepper[]> => {
        const existingPepper = await this.#getPepperIfEditable(pepperID)
        if (!existingPepper) {
            return this.get()
        }
        const cleaned = peppers.filter(p => p.id !== existingPepper.id);
        return this.#set(cleaned);
    }

/*     updatePepper = async (pepperID: string, pepperText: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => p.id === pepperID ? {...p, pepperText} : p);
        return this.#set(updated);
     }
        */

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
        return this.#set(updated);
    }

    deleteAll = async (): Promise<Pepper[]> => {
        //Reset user roles to default
        //Save pepper state to KV
        const peppers = await this.get()
        const cleaned = peppers.filter(p => p.id !== pepperID);
        return this.#set(cleaned);
    }

    grantVoteRole = async (memberID: string) => {
        //Grant vote role to a user
        //return the user
    }

    revokeVoteRole = async (memberID: string) => {
        //Revoke vote role from a user
        //return the user
    }
    
}

export const peppersService = (env: Env, organizationID: string, memberID: string, canOverrideOwnership: boolean) => new PeppersService(env, organizationID, memberID, canOverrideOwnership)