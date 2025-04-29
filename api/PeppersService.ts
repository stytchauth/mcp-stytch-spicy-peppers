import {Pepper} from "../types";

const DEFAULT_PEPPERS = [{
    id: 'pepper_0',
    pepperText: '"Agents" are just sparkling apps',
    upvotes: []
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
            upvotes: [],
        }
        peppers.push(newPepper)
        return this.#set(peppers)
    }

    deletePepper = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const cleaned = peppers.filter(p => p.id !== pepperID);
        return this.#set(cleaned);
    }

    updatePepper = async (pepperID: string, pepperText: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => p.id === pepperID ? {...p, pepperText} : p);
        return this.#set(updated);
    }

    setUpvote = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => p.id === pepperID ? {...p, upvotes: [...p.upvotes, {memberID: this.env.STYTCH_MEMBER_ID, memberName: this.env.STYTCH_MEMBER_NAME}]} : p);
        return this.#set(updated);
    }

    deleteUpvote = async (pepperID: string): Promise<Pepper[]> => {
        const peppers = await this.get()
        const updated = peppers.map(p => p.id === pepperID ? {...p, upvotes: p.upvotes.filter(u => u.memberID !== this.env.STYTCH_MEMBER_ID)} : p);
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

export const peppersService = (env: Env, organizationID: string) => new PeppersService(env, organizationID)