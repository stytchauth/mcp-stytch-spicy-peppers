import {createMiddleware} from "hono/factory";
import {HTTPException} from "hono/http-exception";
import {getCookie} from "hono/cookie";
import {B2BClient, StytchError} from "stytch";
import {AuthenticationContext} from "../../types";


let client: B2BClient | null = null;

function getClient(env: Env): B2BClient {
    if (!client) {
        console.log(env)
        client = new B2BClient({
            project_id: env.STYTCH_PROJECT_ID,
            secret: env.STYTCH_PROJECT_SECRET,
            env: import.meta.env.VITE_TEST_API_URL,
        })
    }
    return client
}

export type RBACAction = 'create' | 'read' | 'updateOwn' | 'deleteOwn' | 'upvote' | 'deleteOwnUpvote' | 'deleteAll' | 'grantVoteRole' | 'revokeVoteRole' | 'overrideOwnership'

/**
 * stytchAuthMiddleware is a Hono middleware that validates that the user is logged in
 * It checks for the stytch_session_jwt cookie set by the Stytch FE SDK and verifies that the
 * caller has permission to access the specified resource and action within the tenant
 */
export const stytchSessionAuthMiddleware = (action: RBACAction) => createMiddleware<{
    Variables: {
        memberID: string,
        organizationID: string,
        canOverrideOwnership: boolean,
        canGrantVoteRole: boolean,
    },
    Bindings: Env,
}>(async (c, next) => {
    const sessionCookie = getCookie(c, 'stytch_session_jwt') ?? '';

    try {
        // First: Authenticate the Stytch Session JWT and get the caller's request context
        const authRes = await getClient(c.env).sessions.authenticateJwt({
            session_jwt: sessionCookie,
        })

        // Next: Now that we have the organization ID we can check that the caller has broad permissions
        // to interact with the supplied resource and action within the org ID
        // Depending on how your API exposes IDs, this is an important step to protect against IDOR vulnerabilities
        // Read the RBAC Guide for more information:
        // https://stytch.com/docs/b2b/guides/rbac/backend
        await getClient(c.env).sessions.authenticateJwt({
            session_jwt: sessionCookie,
            authorization_check: {organization_id: authRes.member_session.organization_id, resource_id: "pepper", action}
        })

        // Also check if the caller has the overrideOwnership action.
        // Do this seperately in a sub try/request block - it's completely OK for the user to not have this action,
        // but for the sake of keeping these auth checks simple, we'll check it in this middleware.
        c.set('canOverrideOwnership', false)
        try {
            await getClient(c.env).sessions.authenticateJwt({
                session_jwt: sessionCookie,
                authorization_check: {
                    organization_id: authRes.member_session.organization_id,
                    resource_id: "pepper",
                    action: "overrideOwnership",
                },
            });
            c.set('canOverrideOwnership', true)
        }
        catch (error) {
            if (error instanceof StytchError) {
                if (error.status_code !== 403) {
                    //403 is the expected error if the user doesn't have overrideOwnership.
                    // Anything else is unexpected and should be logged.
                    console.error(error)
                    throw(error)
                }
            }
            else { //Any other error is unexpected and should be rethrown.
                console.error(error)
                throw(error)
            }
        }

        // In order to have a nice display name, we need to get the email address of the member.
        // This denormalizes this data, but no logic should be used on this field - use the memberID instead.
        c.set('memberID', authRes.member_session.member_id);
        c.set('organizationID', authRes.member_session.organization_id);
    } catch (error) {
        console.error(error);
        throw new HTTPException(401, {message: 'Unauthenticated'})
    }

    await next()
})

/**
 * stytchBearerTokenAuthMiddleware is a Hono middleware that validates that the request has a Stytch-issued bearer token
 * Tokens are issued to clients at the end of a successful OAuth flow
 */
export const stytchBearerTokenAuthMiddleware = createMiddleware<{
    Bindings: Env,
}>(async (c, next) => {
    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HTTPException(401, {message: 'Missing or invalid access token'})
    }
    const accessToken = authHeader.substring(7);

    try {
        const tokenRes = await getClient(c.env).idp.introspectTokenLocal(accessToken);
        // @ts-expect-error executionCtx is untyped
        c.executionCtx.props = {
            organizationID: tokenRes.organization.organization_id,
            accessToken,
            memberID: tokenRes.subject
        }
    } catch (error) {
        console.error(error);
        throw new HTTPException(401, {message: 'Unauthenticated'})
    }
    await next()
})

export type RBACCheckResult = {
    canOverrideOwnership: boolean;
}

/**
 * stytchRBACEnforcement validates that the caller has permission to access the specified resource and action within the tenant
 * Unlike with REST APIs, MCP APIs are stateful and long-lasting, so authorization needs to be checked on each tool call
 * Instead of during the initial processing of the request
 */
export async function stytchRBACEnforcement(env: Env, ctx: AuthenticationContext, action: RBACAction): Promise<RBACCheckResult> {
    // Check basic RBAC action
    await getClient(env).idp.introspectTokenLocal(ctx.accessToken, {
        authorization_check: {
            organization_id: ctx.organizationID,
            resource_id: "pepper",
            action: action,
        }
    });

    // Check overrideOwnership action. An exception is thrown if the user does not have this action, but
    // this is generally OK. This, too, needs to be checked on every call because this permission can change
    // during the lifetime of the connection.
    const checkResult: RBACCheckResult = {
        canOverrideOwnership: false
    }
    try {
        await getClient(env).idp.introspectTokenLocal(ctx.accessToken, {
            authorization_check: {
                organization_id: ctx.organizationID,
                resource_id: "pepper",
                action: "overrideOwnership",
            }
        });
        checkResult.canOverrideOwnership = true
    }
    catch (error: unknown) {
        const stytchError = error as { code?: string };
        if (stytchError.code) {
            if (stytchError.code !== "invalid_permissions") {
                //403 is the expected error if the user doesn't have overrideOwnership.
                // Anything else is unexpected and should be logged.
                console.error(error)
                throw(error)
            }
            // Happy path - user doesn't have overrideOwnership, but that's OK.
            // This is the only error we expect to see here.
        }
        else { //Any other error is unexpected and should be rethrown.
            console.error(error)
            throw(error)
        }
    }
    return checkResult;
}


export function getStytchOAuthEndpointUrl(env: Env, endpoint: string): string {
    if (import.meta.env.VITE_TEST_API_URL) {
        return `${import.meta.env.VITE_TEST_API_URL}/v1/public/${env.STYTCH_PROJECT_ID}/${endpoint}`;
    }
    const baseURL = env.STYTCH_PROJECT_ID.includes('test') ?
        'https://test.stytch.com/v1/public' :
        'https://api.stytch.com/v1/public';

    return `${baseURL}/${env.STYTCH_PROJECT_ID}/${endpoint}`
}