export type Upvote = {
    memberID: string;
}

export type Pepper = {
    uuid: string;
    pepperText: string;
    creatorID: string;
    upvotes: Upvote[];
}

export type Permissions = {
    pepper: 'create' | 'read' | 'updateOwn' | 'deleteOwn' | 'deleteAll' | 'upvote' | 'deleteOwnUpvote' | 'overrideOwnership';
    'stytch.member': 'update.settings.roles';
};

// Context from the auth process, extracted from the Stytch auth token JWT
// and provided to the MCP Server as this.props
type AuthenticationContext = {
    organizationID: string;
    accessToken: string;
    memberID: string;
    canOverrideOwnership: boolean;
}
