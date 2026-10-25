# Deploy both repositories and submit to your professor

Repositories:
- Your app: https://github.com/nannanvp/SchemaWise-AI
- Professor copy: https://github.com/nannanvp/SchemaWise-AI-Copy

The repositories contain separate copies of the same app. A GitHub repository URL is not the deployed app URL. Create one Render Web Service per repository, then record each service's actual HTTPS URL.

## Option A: Blueprint (recommended)

1. Sign in at https://dashboard.render.com and connect GitHub.
2. Choose **New > Blueprint**, select **SchemaWise-AI**, and use branch **main**. The root render.yaml supplies the build, start, health-check, and environment settings.
3. Enter your real key in the **GROQ_API_KEY** secret field. Apply/deploy the Blueprint.
4. Wait for the service to become Live. Copy the actual URL Render shows and test it using the checklist below.
5. Repeat **New > Blueprint** for **SchemaWise-AI-Copy**. Its service name is schemawise-ai-copy. Enter the Groq key for this service too. Each service needs its own environment configuration. If a service name is unavailable, choose a unique name.
6. If you need to correct a key later: open that service > **Environment**, set GROQ_API_KEY, then **Save and deploy**. Never put the key in GitHub, README, frontend code, or email.

You may use the same Groq key for both services; they then share its account limits. A separate key makes the professor copy easier to manage independently.

## Option B: Manual Web Services

Repeat **New > Web Service** for each GitHub repository:

| Setting | Your service | Professor service |
| --- | --- | --- |
| Repository | SchemaWise-AI | SchemaWise-AI-Copy |
| Branch | main | main |
| Name | schemawise-ai (or unique name) | schemawise-ai-copy (or unique name) |
| Language | Python 3 | Python 3 |
| Root directory | leave blank | leave blank |
| Build command | pip install -r backend/requirements.txt | pip install -r backend/requirements.txt |
| Start command | uvicorn backend.main:app --host 0.0.0.0 --port $PORT | uvicorn backend.main:app --host 0.0.0.0 --port $PORT |
| Health check | /api/health | /api/health |
| Instance | Free for demonstration | Free for demonstration |

Set these environment variables on **each** service:

```text
PYTHON_VERSION=3.11.9
AI_PROVIDER=groq
GROQ_MODEL_PRIMARY=qwen/qwen3.8-27b
GROQ_MODEL_SECONDARY=openai/gpt-oss-120b
GROQ_API_KEY=<enter your real key privately in Render>
```

Use a **Web Service**, because FastAPI must run. The frontend is served by that same service. There is no separate Node build.

## Verify each deployed URL

- Open the homepage and /api/health.
- Review a SQL schema and open its AI explanation.
- Open Quiz, choose AI-generated practice, request one question, answer it and confirm the explanation and score appear. A configured status chip alone does not verify the API key.
- Switch back to Official GATE PYQs and grade a question.
- Open Exam Questions and load a question from each of the five topics. Open an original PDF link.
- Open Learn, Download, and Help separately; try a download.
- Repeat these checks on the copy's independent URL before submission.

If AI generation fails, inspect Render Logs, confirm GROQ_API_KEY was saved and deployed, and check your Groq account's model access and limits. The sourced bank works without Groq.

## Add deployed URLs to GitHub About

For each repository, open its main page and click the gear beside **About**. Paste that repository's actual Render URL in **Website**, then save. Your repo must point to your service; the copy must point to the copy's service. Do this after both deployments succeed.

## Transfer only the copy to your professor

1. Obtain the professor's exact GitHub username and email address.
2. Complete the deployed acceptance checks above and add both About links.
3. In **SchemaWise-AI-Copy**, open **Settings > General > Danger Zone > Transfer ownership**. Enter the professor's GitHub username and confirm the repository name. Keep SchemaWise-AI in your account.
4. For a personal-account transfer, GitHub sends the recipient a confirmation email. GitHub currently requires acceptance within one day. A collaborator invitation is not an ownership transfer.
5. Email the professor the copy repository link, its deployed URL, and a note that the GitHub transfer invitation has been sent. Do not include your API key.
6. After acceptance, record the new repository URL and verify the Render service still works. Check Render's repository connection/access before the next deployment; GitHub ownership transfer does not transfer the Render service or its billing. Coordinate Render ownership separately if the professor needs to manage hosting.

Email template (fill actual values only):

Subject: SchemaWise AI - deployed project and repository transfer

Dear Professor,
My SchemaWise AI project is deployed and ready for verification.
My repository: https://github.com/nannanvp/SchemaWise-AI
My deployed app: [your actual Render URL]
Your copy repository: [current copy repository URL]
Your deployed copy: [actual copy Render URL]
I have initiated the GitHub ownership transfer to [professor username]. Please accept GitHub's confirmation email before it expires.
Regards,
[student name and registration number]

## Render Free limitations

Free web services sleep after 15 minutes without traffic and can take about a minute to wake. Local SQLite review history and scores are lost on restart, redeploy, or spin-down. Both services share workspace free-instance allowances. For durable history, use a paid service with a persistent disk mounted at /data and set SCHEMAWISE_DB=/data/history.db. Confirm current pricing before selecting a paid plan.

## Official references

- https://render.com/docs/deploy-fastapi
- https://render.com/docs/blueprint-spec
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/free
- https://console.groq.com/docs/models
- https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
