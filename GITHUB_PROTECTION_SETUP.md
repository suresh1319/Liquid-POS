# Setting Up Branch Protection Rules in GitHub

Follow these steps to protect your `main` and `development` branches:

## Step 1: Access Branch Protection Settings

1. Go to your GitHub repository
2. Click on "Settings" (tab on the top right)
3. In the left sidebar, click on "Branches"
4. Under "Branch protection rules", click "Add rule"

## Step 2: Protect the Main Branch

1. In "Branch name pattern", enter `main`
2. Check the following options:
   - ✅ "Require a pull request before merging"
   - ✅ "Require approvals" (set to at least 1)
   - ✅ "Dismiss stale pull request approvals when new commits are pushed"
   - ✅ "Require status checks to pass before merging" (if you have CI setup)
   - ✅ "Require branches to be up to date before merging"
   - ✅ "Do not allow bypassing the above settings"
3. Click "Create" or "Save changes"

## Step 3: Protect the Development Branch

1. Click "Add rule" again
2. In "Branch name pattern", enter `development`
3. Check the same options as for the main branch
4. Click "Create" or "Save changes"

## Step 4: Set Repository Permissions (Optional)

For more granular control:

1. Go to "Settings" > "Collaborators and teams"
2. Add your interns with appropriate permissions:
   - For interns: Give them "Write" access (allows creating branches and PRs)
   - For senior developers: Give them "Maintain" access (can manage the repository but not change settings)
   - Keep "Admin" access only for yourself

## Step 5: Test the Protection

1. Ask an intern to try pushing directly to the protected branches
2. They should receive an error message like:
   ```
   remote: error: GH006: Protected branch update failed for refs/heads/main.
   remote: error: At least 1 approving review is required
   ```
3. Verify they can still create branches and pull requests

## Additional Settings to Consider

### Automatically Delete Head Branches
1. Go to "Settings" > "General" > "Pull Requests"
2. Check "Automatically delete head branches"
3. This will clean up feature branches after they're merged

### Required Status Checks
If you have CI/CD setup:
1. In branch protection, under "Require status checks to pass before merging"
2. Search for and select your CI checks
3. This ensures code passes tests before merging 