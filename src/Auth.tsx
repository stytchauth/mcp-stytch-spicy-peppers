import {
    AuthFlowType,
    B2BOAuthProviders,
    B2BProducts,
    StytchB2BUIConfig,
    StytchEvent,
} from "@stytch/vanilla-js";
import {useEffect, useMemo, useState} from "react";
import {useStytchB2BClient, useStytchMember, StytchB2B, B2BIdentityProvider, withStytchPermissions} from "@stytch/react/b2b";
import {
    AdminPortalB2BProducts,
    AdminPortalMemberManagement,
} from '@stytch/react/b2b/adminPortal';
import {NavLink, useLocation} from "react-router-dom";
import {IDPConsentScreenManifest} from "@stytch/vanilla-js/b2b";
import {Permissions} from "../types";
import {PermissionsMap} from "@stytch/core/public";
import {hc} from 'hono/client';
import {PeppersApp} from "../api/PeppersAPI.ts";


const client = hc<PeppersApp>(`${window.location.origin}/api`);

const deleteAllPeppers = () =>
    client.peppers.$delete()
        .then(res => res.json())
        .then(res => res.peppers);

/**
 * A higher-order component that enforces a login requirement for the wrapped component.
 * If the user is not logged in, the user is redirected to the login page and the
 * current URL is stored in localStorage to enable return after authentication.
 */
export const withLoginRequired = <P extends object>(
    Component: React.ComponentType<P>
) => {
    const WrappedComponent: React.FC<P> = (props) => {
        const {member} = useStytchMember()
        useEffect(() => {
            if (!member) {
                localStorage.setItem('returnTo', window.location.href);
                window.location.href = '/login';
            }
        }, [member])

        if (!member) {
            return null
        }
        return <Component {...props}  />;
    };

    WrappedComponent.displayName = `withLoginRequired(${Component.displayName ?? Component.name})`;

    return WrappedComponent;
};

/**
 * The other half of the withLoginRequired flow
 * Redirects the user to a specified URL stored in local storage or a default location.
 * Behavior:
 * - Checks for a `returnTo` entry in local storage to determine the redirection target.
 * - If `returnTo` exists, clears its value from local storage and navigates to the specified URL.
 * - If `returnTo` does not exist, redirects the user to the default '/peppers' location.
 */
const onLoginComplete = () => {
    const returnTo = localStorage.getItem('returnTo')
    if (returnTo) {
        localStorage.setItem('returnTo', '');
        window.location.href = returnTo;
    } else {
        window.location.href = '/peppers';
    }
}

export function SignUpOrLogIn() {
    const signUpConfig = useMemo<StytchB2BUIConfig>(() => ({
        authFlowType: AuthFlowType.Organization,
        organizationSlug: "spicy-peppers",
        products: [B2BProducts.emailOtp, B2BProducts.emailMagicLinks],
        sessionOptions: {sessionDurationMinutes: 60 * 24},
        emailMagicLinksOptions: {
            signupRedirectURL: window.location.origin + '/authenticate',
            loginRedirectURL: window.location.origin + '/authenticate',
        },
        oauthOptions: {
            providers: [{type: B2BOAuthProviders.Google}],
            signupRedirectURL: window.location.origin + '/authenticate',
            loginRedirectURL: window.location.origin + '/authenticate',
        },
    }), [])

    const handleOnLoginComplete = (evt: StytchEvent) => {
        if (evt.type !== "AUTHENTICATE_FLOW_COMPLETE") return;
        // Let them savor the success screen
        setTimeout(onLoginComplete, 300);
    }

    return (
        <>
            <h1 className="app-title">🌶️ Spicy Peppers</h1>
            <StytchB2B config={signUpConfig} callbacks={{onEvent: handleOnLoginComplete}}/>
        </>
    )
}

/**
 * The OAuth Authorization page implementation. Wraps the Stytch B2BIdentityProvider UI component.
 * View all configuration options at https://stytch.com/docs/sdks/idp-ui-configuration
 */
export const Authorize = withLoginRequired(function () {
    const [initialized, setInitialized] = useState(false)
    const {member} = useStytchMember()

    // Important! The Model Context Procol doesn't yet define "scope discovery" so there are no custom scopes being requested
    // This is an open part of the specification and will likely change in the future
    // In the meantime, we will fake the scopes being requested
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('scope', 'openid email profile read:pepper write:pepper manage:pepper');
        window.history.pushState(null, '', url.toString());
        setInitialized(true)
    }, []);

    // The text on the Consent screen can be dynamically generated based on the scopes requested
    // Only scopes that the logged-in member will have permission to grant will be passed in to the generator
    // Group scopes by Resource, or by Action, or some other way that makes sense for your target audience
    const consentManifestGenerator = ({scopes}: { scopes: string[]; }): IDPConsentScreenManifest => {
        const filtered = (s: Array<string | null>): Array<string> => s.filter(Boolean) as Array<string>;

        const profilePermissions = {
            header: "View your account information",
            items: filtered([
                scopes.includes('profile') ? 'Your profile and organization ID' : null,
                scopes.includes('email') ? `Your email address (${member?.email_address})` : null,
            ])
        }

        const pepperPermissions = {
            header: `Access your organization's Spicy Peppers`,
            items: filtered([
                scopes.includes('read:pepper') ? 'Read your Organization\'s Spicy Peppers' : null,
                scopes.includes('write:pepper') ? 'Create, delete, and vote on Spicy Peppers' : null ,
                scopes.includes('manage:pepper') ? 'Manage others\'s Spicy Peppers' : null ,

            ]),
        }


        return [
            profilePermissions,
            pepperPermissions,
        ].filter(v => v.items?.length > 0)
    }

    return initialized && <B2BIdentityProvider getIDPConsentManifest={consentManifestGenerator}/>
})

type Role = {
    role_id: string;
    description: string;
}
const adminPortalConfig = {
    allowedAuthMethods: [
        AdminPortalB2BProducts.emailMagicLinks,
    ],
    getRoleDescription: (role: Role) => {
        if (role.role_id == 'stytch_admin') {
            return 'Full access.'
        } else if (role.role_id == 'pepperAdmin') {
            return 'Can manage Spicy Pepper submissions (e.g. delete others\' submissions).'
        } else if (role.role_id == 'pepperVoter') {
            return 'Can vote on Spicy Peppers.'
        } else if (role.role_id == 'stytch_member') {
            return 'Can submit new Spicy Peppers.'
        } else {
            return role.description;
        }
    },
    getRoleDisplayName: (role: Role) => {
        if (role.role_id == 'stytch_admin') {
            return 'Admin'
        }
        else if (role.role_id == 'pepperAdmin') {
            return 'Peppers manager'
        } else if (role.role_id == 'pepperVoter') {
            return 'Voter'
        } else if (role.role_id == 'stytch_member') {
            return 'Submitter'
        } else {
            return role.role_id
        }
    }
}


type VoteGrantProps = {
    stytchPermissions: PermissionsMap<Permissions>;
};
export const GrantVoteRole = withLoginRequired(withStytchPermissions<Permissions, object>(
    ({stytchPermissions}: VoteGrantProps) => {

        const stytch = useStytchB2BClient();
        const canAdminVoteRole = () => {
            return stytchPermissions['stytch.member']['update.settings.roles'];
        };

        const onGrantVoteRole = async () => {
            const members_result = await stytch.organization.members.search({}); // Get all non-deleted members
            for (const member of members_result.members) {
                const new_roles = member.roles.reduce((acc: string[], role) => {
                    if (role.role_id !== "stytch_member") { // Filter out any default roles - which in this case is stytch_member
                        acc.push(role.role_id); 
                    }
                    return acc;
                }, []);
                await stytch.organization.members.update({
                    member_id: member.member_id,
                    roles: [...new_roles, 'pepperVoter'],
                })
            }
            // Gross. This should be refreshable on the local page, but I don't have time to dig in to how the user management
            // component stores its state.
            window.location.reload();
        }

        const onRemoveVoteRole = async () => {
            const members_result = await stytch.organization.members.search({}); // Get all non-deleted members
            for (const member of members_result.members) {
                const new_roles = member.roles.filter(role => role.role_id !== 'pepperVoter' && role.role_id !== 'stytch_member')
                await stytch.organization.members.update({
                    member_id: member.member_id,
                    roles: new_roles.map(role => role.role_id),
                })
            }
            // Gross. This should be refreshable on the local page, but I don't have time to dig in to how the user management
            // component stores its state.
            window.location.reload();
        }
        return (
            <div>
                <h2>Grant / Remove Pepper Voting Role</h2>
                <button disabled={!canAdminVoteRole()} onClick={() => onGrantVoteRole()}>
                    <img className="icon" src="/pepper.png" alt="Grant pepper voting to all users" />
                </button>
                <button disabled={!canAdminVoteRole()} onClick={() => onRemoveVoteRole()}>
                    <img className="icon" src="/trash.png" alt="Remove pepper voting from all users" />
                </button>
                <hr />
                <br />
            </div>
        )
}))

const adminPortalStyles = {
    fontFamily: `'Booton', monospace;`,
    container: {
        backgroundColor: '#F4EEE9',
        borderWidth: 5,
        borderColor: '#B2D6DE',
        borderStyle: 'solid',
        borderRadius: '10px',
    }
}

export const ResetAll = withLoginRequired(withStytchPermissions<Permissions, object>(
    ({stytchPermissions}: {stytchPermissions: PermissionsMap<Permissions>}) => {

    const onResetAll = () => {
        deleteAllPeppers().then(() => {
            // Just to be sure, refresh everything
            window.location.reload();
        });
    };

    const canResetAll = () => {
        return stytchPermissions.pepper.deleteAll
    };

    return (
        <button className={canResetAll() ? "reset-all" : "hidden"} onClick={() => onResetAll()}>
            DANGEROUS: Reset All Peppers
        </button>
    )
}))

export const MemberSettings = withLoginRequired(
    () => {
        return (
            <div>
                <GrantVoteRole/>
                <AdminPortalMemberManagement styles={adminPortalStyles} config={adminPortalConfig}/>
                <ResetAll />
        </div>
    )
})

export const Nav = withStytchPermissions<Permissions, object>(
    ({stytchPermissions}: {stytchPermissions: PermissionsMap<Permissions>}) => {
        const stytch = useStytchB2BClient()
        useLocation()
        const {member} = useStytchMember()

        const canSeeMemberTab = () => {
            return stytchPermissions['stytch.member']['update.settings.roles'];
        };

    if (!member) return null;

    return (
        <nav>
            <NavLink className={location.pathname === "/peppers" ? "active" : ""} to="/peppers">
                <button className="primary">Spicy Peppers</button>
            </NavLink>
            {canSeeMemberTab() && <NavLink className={location.pathname === "/settings/members" ? "active" : ""} to="/settings/members">
                <button className="primary">Administration</button>
            </NavLink>}
            <a className="logout" onClick={() => stytch.session.revoke()}>
                <button className="primary logout"> Log Out</button>
            </a>
        </nav>
    )
})