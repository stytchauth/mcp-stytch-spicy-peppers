export type Upvote = {
    memberID: string;
    memberName: string;
}

export type Pepper = {
    id: string;
    pepperText: string;
    upvotes: Upvote[];
}

export type Permissions = {
    pepper: 'create' | 'read' | 'update' | 'upvote' | 'delete' | 'deleteAll' | 'grantVoteRole' | 'revokeVoteRole';
};

// Context from the auth process, extracted from the Stytch auth token JWT
// and provided to the MCP Server as this.props
type AuthenticationContext = {
    organizationID: string;
    accessToken: string;
}
