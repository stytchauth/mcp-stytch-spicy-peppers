#!/usr/bin/env node

import { program } from 'commander';
import { fetch } from 'undici';

const policy = {
    "custom_resources": [
        {
            "resource_id": "objective",
            "available_actions": ["create", "read", "update", "delete"]
        },
        {
            "resource_id": "key_result",
            "available_actions": ["create", "read", "update", "delete"]
        }
    ],
    "custom_roles": [
        {
            "role_id": "manager",
            "permissions": [
                {
                    "resource_id": "key_result",
                    "actions": ["*"]
                },
                {
                    "resource_id": "objective",
                    "actions": ["read"]
                },
                {
                    "resource_id": "stytch.member",
                    "actions": ["create", "search"]
                }
            ]
        }
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
                "resource_id": "objective",
                "actions": ["read"]
            },
            {
                "resource_id": "key_result",
                "actions": ["read", "update"]
            }
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
                "resource_id": "objective",
                "actions": ["*"]
            },
            {
                "resource_id": "key_result",
                "actions": ["*"]
            }
        ]
    }
};

program
  .description('Make an authenticated PUT request')
  .requiredOption('--key-id <keyId>', 'Management API Key ID for authentication')
  .requiredOption('--secret <secret>', 'Management API Secret for authentication')
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
    // Create Basic Auth header
    const credentials = Buffer.from(`${options.keyId}:${options.secret}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    };

    // Make the request with the policy object
    const response = await fetch(rbac_url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('Error Response:', responseText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`Success! Status code: ${response.status}`);
    console.log(`Response: ${responseText}`);

  } catch (error) {
    console.error('Error making request:', error.message);
    process.exit(1);
  }
}

makePutRequest(); 