#!/usr/bin/env node

import { program } from 'commander';
import { fetch } from 'undici';

const policy = {
    "custom_resources": [
        {
            "resource_id": "pepper",
            "available_actions": ["create", "read", "updateOwn", "deleteOwn", "deleteAll", "upvote", "deleteOwnUpvote", "overrideOwnership", "adminVoteRole"]
        },
    ],
    "custom_roles": [
        {
            "role_id": "pepperVoter",
            "permissions": [
                {
                    "resource_id": "pepper",
                    "actions": ["upvote", "deleteOwnUpvote"]
                },
            ]
        },
        {
            "role_id": "pepperAdmin",
            "permissions": [
                {
                    "resource_id": "pepper",
                    "actions": ["overrideOwnership", "deleteAll", "adminVoteRole"]
                },
            ]
        }
    ],
    "custom_scopes": [
        {
            "scope": "write:pepper",
            "permissions": [
                {
                    "resource_id": "pepper",
                    "actions": ["create", "read", "updateOwn", "deleteOwn", "upvote", "deleteOwnUpvote"]
                }
            ]
        },
        {
            "scope": "read:pepper",
            "permissions": [
                {
                    "resource_id": "pepper",
                    "actions": ["read"]
                }
            ]
        },
        {
            "scope": "manage:pepper",
            "permissions": [
                {
                    "resource_id": "pepper",
                    "actions": ["overrideOwnership", "deleteAll", "adminVoteRole"]
                }
            ]
        },
    ],
    "stytch_member": {
        "role_id": "stytch_member",
        "description": "Granted to all Members upon creation; grants permissions already implicitly granted to logged in Members via the SDK. Cannot be deleted.",
        "permissions": [
            {
                "resource_id": "stytch.self",
                "actions": ["*"]
            },
            {
                "resource_id": "stytch.member",
                "actions": ["search"]
            },
            {
                "resource_id": "pepper",
                "actions": ["create", "read", "updateOwn", "deleteOwn"]
            },
        ]
    },
    "stytch_admin": {
        "role_id": "stytch_admin",
        "description": "Granted to Members who create an organization through the Stytch discovery flow. Admins will also have the stytch_member role. Cannot be deleted.",
        "permissions": [
            {
                "resource_id": "stytch.organization",
                "actions": ["*"]
            },
            {
                "resource_id": "stytch.member",
                "actions": ["*"]
            },
            {
                "resource_id": "stytch.sso",
                "actions": ["*"]
            },
            {
                "resource_id": "stytch.scim",
                "actions": ["*"]
            },
            {
                "resource_id": "pepper",
                "actions": ["*"]
            },
        ]
    }
};

program
  .description('Make an authenticated PUT request')
  .requiredOption('--key-id <keyId>', 'Management API Key ID')
  .requiredOption('--secret <secret>', 'Management API Secret')
  .requiredOption('--project-id <projectId>', 'Project ID you are updating')
  .parse(process.argv);
const options = program.opts();
const rbac_url = `https://management.stytch.com/v1/projects/${options.projectId}/rbac_policy`;
const body = {
    "project_id": options.projectId,
    "policy": policy
}

async function makePutRequest() {
  try {
    const credentials = Buffer.from(`${options.keyId}:${options.secret}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(rbac_url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    const responseText = await response.json();
    
    if (!response.ok) {
      console.error('Error Response:', responseText);
      throw new Error(`HTTP Error! status: ${response.status}`);
    }

    console.log(`Success! status code: ${response.status}`);
    console.log(`Response: ${JSON.stringify(responseText, null, 2)}`);

  } catch (error) {
    console.error('Error making request:', error.message);
    process.exit(1);
  }
}

makePutRequest(); 