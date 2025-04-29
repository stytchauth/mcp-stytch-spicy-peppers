import {Hono} from "hono";
import {peppersService} from "./PeppersService.ts";
import {stytchSessionAuthMiddleware} from "./lib/auth";

/**
 * The Hono app exposes the Spicy Pepper Service via REST endpoints for consumption by the frontend
 */
export const PeppersAPI = new Hono<{ Bindings: Env }>()

    .get('/peppers', stytchSessionAuthMiddleware('read'), async (c) => {
        // Get all peppers
        const peppers = await peppersService(c.env, c.var.organizationID).get()
        return c.json({peppers});
    })

    .post('/peppers', stytchSessionAuthMiddleware('create'), async (c) => {
        // Add a new pepper. Can be called by any authenticated user.
        const newPepper = await c.req.json<{ pepperText: string }>();
        const peppers = await peppersService(c.env, c.var.organizationID).addPepper(newPepper.pepperText)
        return c.json({peppers});
    })

    .post('/peppers/:pepperID', stytchSessionAuthMiddleware('update'), async (c) => {
        // Update a pepper. Only pepperText can be updated with this endpoint.
        // Can be called by any authenticated user.
        const newPepperState = await c.req.json<{ pepperText: string }>();
        // Get the existing pepper
        const peppers = await peppersService(c.env, c.var.organizationID).updatePepper(c.req.param().pepperID, newPepperState.pepperText)
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID', stytchSessionAuthMiddleware('delete'), async (c) => {
        // Delete a pepper. Can be called by any authenticated user, but only the creator of the pepper can delete it.
        // Can be called by any admin to delete any pepper.
        const objectives = await peppersService(c.env, c.var.organizationID).deletePepper(c.req.param().pepperID)
        return c.json({objectives});
    })

    .post('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('upvote'), async (c) => {
        // Upvote a pepper (add the memberID to the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to upvote for any user.
        const peppers = await peppersService(c.env, c.var.organizationID).setUpvote(c.req.param().pepperID)
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('deleteUpvote'), async (c) => {
        // Delete a upvote from a pepper (remove the memberID from the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to delete any upvote.
        const peppers = await peppersService(c.env, c.var.organizationID).deleteUpvote(c.req.param().pepperID)
        return c.json({peppers});
    })

    .delete('/peppers', stytchSessionAuthMiddleware('deleteAll'), async (c) => {
        // Delete all peppers. Can be called by any admin.
        // This also resets all state in this app (reprovisions it) and resets RBAC for all users.
        const peppers = await peppersService(c.env, c.var.organizationID).deleteAll()
        return c.json({peppers});
    })

    .post('/rbac/vote/:memberID', stytchSessionAuthMiddleware('grantVoteRole'), async (c) => {
        // Grant vote role to a user. Can be called by any admin.
        await peppersService(c.env, c.var.organizationID).grantVoteRole(c.req.param().memberID)
        return c.json({'success': true});
    })

    .delete('/rbac/vote/:memberID', stytchSessionAuthMiddleware('revokeVoteRole'), async (c) => {
        // Revoke vote role from a user. Can be called by any admin.
        await peppersService(c.env, c.var.organizationID).revokeVoteRole(c.req.param().memberID)
        return c.json({'success': true});
    })


export type PeppersApp = typeof PeppersAPI;