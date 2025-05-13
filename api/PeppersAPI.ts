import {Context, Hono} from "hono";
import {streamSSE} from "hono/streaming";
import {peppersService} from "./PeppersService.ts";
import {stytchSessionAuthMiddleware} from "./lib/auth";

// Manage SSE events
let sseEventId = 0;
let nextKvFetchTimestamp = 0;
let currentPeppersRevision = 0;
const checkPeppersRevision = async (context: Context) => {
    if (nextKvFetchTimestamp < Date.now()) {
        // We trigger an immediate fetch of the SSE counter from the KV store on all API calls to this server that will update the value.
        // Therefore, this cooldown time is effectuvely the max latency for a KV fetch catching new state from some other API server / the MCP server.
        // Simultaneously, this cooldown time is as fast as we will poll - and touch Cloudflare's KV store - for new state. We don't need to
        // hammer this service repeatedly.
        nextKvFetchTimestamp = Date.now() + 5000;
        currentPeppersRevision = await peppersService(context.env, context.var.organizationID, context.var.memberID).getSseCounter()
    }
    return currentPeppersRevision;
}

const fetchPeppersRevisionOnNextTick = async () => {
    // Invalidate the cooldown time so we immediately fetch the latest value from the KV store.
    nextKvFetchTimestamp = 0
}

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
        fetchPeppersRevisionOnNextTick()
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID', stytchSessionAuthMiddleware('deleteOwn'), async (c) => {
        // Delete a pepper. Can be called by any authenticated user, but only the creator of the pepper can delete it.
        // Can be called by any admin to delete any pepper.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deletePepper(c.req.param().pepperID, c.var.canOverrideOwnership)
        fetchPeppersRevisionOnNextTick()
        return c.json({peppers});
    })

    .post('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('upvote'), async (c) => {
        // Upvote a pepper (add the memberID to the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to upvote for any user.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).setUpvote(c.req.param().pepperID)
        fetchPeppersRevisionOnNextTick()
        return c.json({peppers});
    })

    .delete('/peppers/:pepperID/upvote', stytchSessionAuthMiddleware('deleteOwnUpvote'), async (c) => {
        // Delete a upvote from a pepper (remove the memberID from the upvotes array)
        // Can be called by any authenticated user, but only in the context of their own user.
        // Can be called by any admin to delete any upvote.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deleteUpvote(c.req.param().pepperID)
        fetchPeppersRevisionOnNextTick()
        return c.json({peppers});
    })

    .delete('/peppers', stytchSessionAuthMiddleware('deleteAll'), async (c) => {
        // Delete all peppers. Can be called by any admin.
        const peppers = await peppersService(c.env, c.var.organizationID, c.var.memberID).deleteAll()
        fetchPeppersRevisionOnNextTick()
        return c.json({peppers});
    })

    // SSE for real-time updates.
    // This is used to notify the frontend when the peppers are updated. There are a couple of things to note for why this feels
    // a bit hacky and ham-handed.
    // Cloudflare is allowed to horizontally scale to an arbitrary number of workers and/or kill off idle workers. This means we can't
    // store state for the SSE connection in memory on the worker; instead we need something durable *and* something that can be
    // shared across workers. Imagine a case where there are 2 API servers, or one API server and one MCP server that handle
    // requests in a different memory space.

    // So we use Cloudflare's KV store to store the SSE counter, and this should be shared across workers.

    // That being said, *usually* there isn't a need to poll Cloudflare's KV store for changes, i.e. what if we have multiple 
    // browsers connected to one and only one API server? It would be good to store the SSE counter in memory on the worker,
    // which means we can avoid polling the KV store for each and every change.
    // Finally, in order to not block here we poll on the server. This should mean that we make 1 request *per API server* to the KV store
    // per X time period, no matter how fast we loop here and not matter how many browsers are subscribed to this endpoint, 
    // and only actually send an SSE event if the value in the KV store has changed, once to each browser within (the timeout here) period
    // of the value changing.
    .get('/peppers/state-changes', stytchSessionAuthMiddleware('read'), async (c) => {
        return streamSSE(c, async (stream) => {
            console.log('SSE connection established')
            try {
                // Initialize the last SSE counter seen on the sse request
                let lastSseCounterSeen = await checkPeppersRevision(c)
                while (true) {
                    try {
                        // Check the current SSE counter on this loop
                        const currentSseCounter = await checkPeppersRevision(c)
                        if (currentSseCounter !== lastSseCounterSeen) {
                            // If the SSE counter has changed, send the new SSE event and save the new counter
                            await stream.writeSSE({
                                data: `Peppers updated; rev ${currentSseCounter}`,
                                event: "message",
                                id: String(sseEventId++),
                            });
                            lastSseCounterSeen = currentSseCounter;
                        }
                        await stream.sleep(1000)
                    } catch (error) {
                        // Handle individual loop iteration errors
                        console.error('Error in SSE loop iteration:', error);
                        // Try to send error to client
                        try {
                            await stream.writeSSE({
                                data: 'Error checking for updates',
                                event: "error",
                                id: String(sseEventId++),
                            });
                        } catch (writeError) {
                            console.error('Failed to write error to stream:', writeError);
                            break; // Break the loop if we can't write to the stream
                        }
                        // Wait a bit before retrying
                        await stream.sleep(5000);
                    }
                }
            } catch (error) {
                console.error('Fatal error in SSE stream:', error);
                try {
                    await stream.writeSSE({
                        data: 'Fatal error in connection',
                        event: "error",
                        id: String(sseEventId++),
                    });
                } catch (writeError) {
                    console.error('Failed to write fatal error to stream:', writeError);
                }
            }
        }, async (err, stream) => {
            console.error('SSE stream error:', err);
            try {
                await stream.writeSSE({
                    data: 'Connection error occurred',
                    event: "error",
                    id: String(sseEventId++),
                });
            } catch (writeError) {
                console.error('Failed to write error to stream:', writeError);
            }
        });
    })

export type PeppersApp = typeof PeppersAPI;