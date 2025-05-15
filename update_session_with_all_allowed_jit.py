#!/usr/bin/env python

import os

from stytch import B2BClient
from stytch.b2b.models.organizations import UpdateRequestOptions
from stytch.shared.method_options import Authorization

# I didn't expect to commit this hacky script, but here we go.
# For Stytch employees: there is a flag "All Allowed JIT Provisioning"
# "https://app.launchdarkly.com/projects/default/flags/all-allowed-jit-provisioning/targeting?env=production&selected-env=production"
# That flag needs to be enabled for the _org_ (e.g. "organization-prod-XXXX....")
# After that, since the dashboard still has no provision for this, we use the API do set this value.

dev_vars_dict = {k:v for k, v in (l.split('=') for l in open(f))}

PROJECT=dev_vars_dict["STYTCH_PROJECT"]
SECRET=dev_vars_dict["STYTCH_SECRET"]
ORGANIZATION=os.environ["STYTCH_ORGANIZATION"]
SESSION=os.environ["HACK_STYTCH_SESSION_TOKEN_FROM_BROWSER"] # Why auth again and manage a token? (again... hack)

client = B2BClient(
    project_id=PROJECT,
    secret=SECRET,
)

resp = client.organizations.update(
    organization_id=ORGANIZATION,
    email_jit_provisioning="ALL_ALLOWED",
    method_options=UpdateRequestOptions(
        authorization=Authorization(
            session_token=SESSION,
        ),
    ),
)

print(resp)
