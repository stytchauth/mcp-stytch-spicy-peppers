export type Upvote = {
    memberID: string;
    memberName: string;
}

export type Pepper = {
    id: string;
    pepperText: string;
    creatorID: string;
    creatorName: string;
    upvotes: Upvote[];
}

export type UserInfo = {
    id: string;
    name: string;
    email: string;
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
