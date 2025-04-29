import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {peppersService} from "./PeppersService.ts";
import {AuthenticationContext, Pepper} from "../types";
import {McpAgent} from "agents/mcp";
import {RBACAction, stytchRBACEnforcement} from "./lib/auth.ts";


/**
 * The `PeppersManagerMCP` class exposes the Peppers Service via the Model Context Protocol
 * for consumption by API Agents
 */
export class PeppersManagerMCP extends McpAgent<Env, unknown, AuthenticationContext> {
    async init() {
    }

    get peppersService() {
        console.log('Binding service to tenant', this.props.organizationID);
        return peppersService(this.env, this.props.organizationID)
    }

    withRequiredPermissions = <T extends CallableFunction>(rbacAction: RBACAction, fn: T): T => {
        const withRequiredPermissionsImpl = async (...args: unknown[]) => {
            await stytchRBACEnforcement(this.env, this.props, rbacAction)
            return fn(...args)
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

    get server() {
        const server = new McpServer({
            name: 'Peppers Manager',
            version: '1.0.0',
        })

        server.resource("Peppers", new ResourceTemplate("peppermanager://peppers/{id}", {
                list: this.withRequiredPermissions('read',
                    async () => {
                        const peppers = await this.peppersService.get()

                        return {
                            resources: peppers.map(pepper => ({
                                name: pepper.pepperText,
                                uri: `peppermanager://peppers/{pepper}.id}`
                            }))
                        }
                    })
            }),
            this.withRequiredPermissions('read',
                async (uri, {id}) => {
                    const peppers = await this.peppersService.get();
                    const objective = peppers.find(pepper => pepper.id === id);
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

        const addObjectiveSchema = {
            objectiveText: z.string(),
        }
        server.tool('addPepper', 'Add a new top-level objective for the organization', addObjectiveSchema,
            this.withRequiredPermissions('create', async (req) => {
                const result = await this.peppersService.addPepper(req.objectiveText)
                return this.formatResponse('Spicy Pepper added successfully', result);
            }))

        const deleteObjectiveSchema = {
            okrID: z.string()
        }
        server.tool('deletePeppers', 'Remove an existing top-level objective from the organization', deleteObjectiveSchema,
            this.withRequiredPermissions('delete', async (req) => {
                const result = await this.peppersService.deletePepper(req.okrID);
                return this.formatResponse('Spicy Pepper deleted successfully', result);
            }));

        return server
    }
}