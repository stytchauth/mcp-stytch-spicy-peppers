import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {peppersService, PepperUneditableError} from "./PeppersService.ts";
import {AuthenticationContext, Pepper} from "../types";
import {McpAgent} from "agents/mcp";
import {RBACAction, RBACCheckResult, stytchRBACEnforcement} from "./lib/auth.ts";


/**
 * The `PeppersManagerMCP` class exposes the Peppers Service via the Model Context Protocol
 * for consumption by API Agents
 */
export class PeppersManagerMCP extends McpAgent<Env, unknown, AuthenticationContext> {
    async init() {
    }

    get peppersService() {
        console.log('Binding service to tenant', this.props.organizationID, this.props.memberID);
        return peppersService(this.env, this.props.organizationID, this.props.memberID)
    }

    withRequiredPermissions = <T extends CallableFunction>(rbacAction: RBACAction, fn: T): T => {
        const withRequiredPermissionsImpl = async (...args: unknown[]) => {
            const checkResult = await stytchRBACEnforcement(this.env, this.props, rbacAction)
            return fn(...args, checkResult)
        }
        return withRequiredPermissionsImpl as unknown as T
    }

    formatResponse = (description: string, newState: Pepper[]): {
        content: Array<{ type: 'text', text: string }>
    } => {
        return {
            content: [{
                type: "text",
                text: `Success! ${description}\n\nNew state:\n${JSON.stringify(newState, null, 2)}\n\nFor Organization:\n${this.props.organizationID}`
            }]
        };
    }

    formatError = (description: string): {
        isError: boolean,
        content: Array<{ type: 'text', text: string }>
    } => {
        return {
            isError: true,
            content: [{type: "text", text: `Error! ${description}`}]
        }
    }



    getPepperIDFromFuzzyIdentifier = async (identifier: string): Promise<string> => {
        const peppers = await this.peppersService.get()
        const potentialMatches = peppers.filter((p) => {
            // We'll accept a key or a fragment of a UUID.
            return p.key === identifier || p.uuid_internal.includes(identifier)
        })
        // ... although we *must* find exactly one match.
        if (potentialMatches.length != 1) {
            throw new Error('No pepper found with identifier: ' + identifier)
        }
        return potentialMatches[0].uuid_internal
    }

    get server() {
        const server = new McpServer({
            name: 'Peppers Manager',
            version: '1.0.0',
        })



        server.resource("Peppers", new ResourceTemplate("peppermanager://peppers/{uuid_internal}", {
                list: this.withRequiredPermissions('read',
                    async () => {
                        const peppers = await this.peppersService.get()

                        return {
                            resources: peppers.map(pepper => ({
                                name: pepper.pepperText,
                                uri: `peppermanager://peppers/${pepper.uuid_internal}`
                            }))
                        }
                    })
            }),
            this.withRequiredPermissions('read',
                async (uri, {uuid_internal}) => {
                    const peppers = await this.peppersService.get();
                    const objective = peppers.find(pepper => pepper.uuid_internal === uuid_internal);
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                text: JSON.stringify(objective, null, 2),
                            },
                        ],
                    }
                }),
        )


        server.tool('listPeppers', 'View all spicy peppers for the organization',
            this.withRequiredPermissions('read', async () => {
                const result = await this.peppersService.get()
                return this.formatResponse('Spicy Peppers retrieved successfully', result);
            }))

        const addPepperSchema = {
            pepperText: z.string(),
        }

        server.tool('addPepper', 'Add a new spicy pepper for the organization', addPepperSchema,
            this.withRequiredPermissions('create', async (req) => {
                const result = await this.peppersService.addPepper(req.pepperText)
                return this.formatResponse('Spicy Pepper added successfully', result);
            }))


        const PepperIdentifier = {
            identifier: z.string()
        }
        server.tool('deletePepper', 'Remove an existing spicy pepper from the organization', PepperIdentifier,
            this.withRequiredPermissions('deleteOwn', async (req, checkResult) => {
                try {
                    let pepperID = req.identifier
                    if (pepperID.length < 32) {
                        // We were given a key or a fragment of a UUID, not a full UUID. Search for the pepper.
                        pepperID = await this.getPepperIDFromFuzzyIdentifier(req.identifier)
                    }
                    const result = await this.peppersService.deletePepper(pepperID, (checkResult as unknown as RBACCheckResult).canOverrideOwnership);
                    return this.formatResponse('Spicy Pepper deleted successfully', result);
                } catch (error) {
                    if (error instanceof PepperUneditableError) {
                        return this.formatError(error.message);
                    } else {
                        throw error;
                    }
                }
            }));

        server.tool('votePepper', 'Upvote an existing spicy pepper', PepperIdentifier,
            this.withRequiredPermissions('upvote', async (req) => {
                try {
                    let pepperID = req.identifier
                    if (pepperID.length < 32) {
                        // We were given a key or a fragment of a UUID, not a full UUID. Search for the pepper.
                        pepperID = await this.getPepperIDFromFuzzyIdentifier(req.identifier)
                    }
                    const result = await this.peppersService.setUpvote(pepperID);
                    return this.formatResponse('Spicy Pepper upvoted successfully', result);
                } catch (error) {
                    if (error instanceof PepperUneditableError) {
                        return this.formatError(error.message);
                    } else {
                        throw error;
                    }
                }
            }));
        server.tool('removeVotePepper', 'Remove an upvote from an existing spicy pepper', PepperIdentifier,
            this.withRequiredPermissions('deleteOwnUpvote', async (req) => {
                try {
                    let pepperID = req.identifier
                    if (pepperID.length < 32) {
                        // We were given a key or a fragment of a UUID, not a full UUID. Search for the pepper.
                        pepperID = await this.getPepperIDFromFuzzyIdentifier(req.identifier)
                    }
                    const result = await this.peppersService.deleteUpvote(pepperID);
                    return this.formatResponse('Spicy Pepper upvoted removed successfully', result);
                } catch (error) {
                    if (error instanceof PepperUneditableError) {
                        return this.formatError(error.message);
                    } else {
                        throw error;
                    }
                }
            }));

        return server
    }
}