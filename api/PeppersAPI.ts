import {Hono} from "hono";
import {peppersService} from "./PeppersService.ts";
import {stytchSessionAuthMiddleware} from "./lib/auth";

/**
 * The Hono app exposes the Spicy Pepper Service via REST endpoints for consumption by the frontend
 */
export const PeppersAPI = new Hono<{ Bindings: Env }>()

    .get('/peppers', stytchSessionAuthMiddleware('read'), async (c) => {
        // Get all peppers
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).get()
        return c.json({peppers});
    })

    .post('/peppers', stytchSessionAuthMiddleware('create'), async (c) => {
        // Add a new pepper. Can be called by any authenticated user.
        const newPepper = await c.req.json<{ pepperText: string }>();
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).addPepper(newPepper.pepperText)
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID', stytchSessionAuthMiddleware('deleteOwn'), async (c) => {
        // Delete a pepper. Can be called by any authenticated user, but only the creator of the pepper can delete it.
        // Can be called by any admin to delete any pepper.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deletePepper(c.req.param().pepperID, c.var.canOverrideOwnership)
        return c.json({peppers});
    })

    .post('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('upvote'), async (c) => {
        // Upvote a pepper (add the memberID to the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to upvote for any user.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).setUpvote(c.req.param().pepperID)
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('deleteOwnUpvote'), async (c) => {
        // Delete a upvote from a pepper (remove the memberID from the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to delete any upvote.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deleteUpvote(c.req.param().pepperID)
        return c.json({peppers});
    })

    .delete('/peppers', stytchSessionAuthMiddleware('deleteAll'), async (c) => {
        // Delete all peppers. Can be called by any admin.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deleteAll()
        return c.json({peppers});
    })

export type PeppersApp = typeof PeppersAPI;