export type Upvote = {
    memberID: string;
}

export type Pepper = {
    id: string;
    pepperText: string;
    creatorID: string;
    upvotes: Upvote[];
}

export type Permissions = {
    pepper: 'create' | 'read' | 'updateOwn' | 'deleteOwn' | 'upvote' | 'removeOwnUpvote' | 'deleteAll' | 'grantVoteRole' | 'revokeVoteRole' | 'overrideOwnership';
};

// Context from the auth process, extracted from the Stytch auth token JWT
// and provided to the MCP Server as this.props
type AuthenticationContext = {
    organizationID: string;
    accessToken: string;
}
