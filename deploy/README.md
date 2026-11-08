# Deploying StudyMate AI

One container serves the API and the built website on a single port. The same Docker image runs on AWS App Runner and on Render, so you can try both and keep the one you like.

These steps have **not** been run for you: they need your own accounts. Docker Desktop was not running and the AWS CLI was not installed on the machine this was written on, so the image build is untested here. The GitHub workflow in `.github/workflows/ci.yml` builds the image on every push, which will be the first real test.

## Before either platform

1. **Database:** run `supabase/schema.sql` in the Supabase SQL editor.
2. **Demo account (optional):** from the `app` folder, `python scripts/seed_demo.py`. It writes to the same Supabase project the deployed site will use, so it works for any deployment.
3. **Put the code on GitHub.** Render needs it, and the CI workflow uses it. Make the `app` folder its own repository:
   ```bash
   cd app
   git init
   git add .
   git status        # check: no .env files and no .demo-account.txt in the list
   git commit -m "StudyMate AI"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
4. **Keys you will need:** the Supabase URL, the publishable (anon) key, the Supabase secret (service) key, and one or two Gemini keys. The publishable key is public by design; the other two must stay secret.

## Option A: AWS App Runner

### Keep the bill under control first

App Runner has no free tier of its own. While a service exists it charges a small amount per hour for its memory even when nobody is using it, which adds up to a few dollars a month. A new AWS account may include free credits: check **Billing > Credits**.

1. In **Billing > Budgets**, create a **zero-spend or $1 budget** with an email alert. Do this before creating anything.
2. Deploy only when you need the URL, and **delete the App Runner service afterwards** (console: App Runner > your service > Actions > Delete). Pausing also stops most of the charge.
3. Delete the ECR image repository and the Secrets Manager secrets when you finish; they cost cents but are easy to forget.

### Steps

You need the [AWS CLI v2](https://aws.amazon.com/cli/) signed in with `aws configure`, and Docker Desktop running. Pick a region near your users, for example `ap-south-1` (Mumbai).

**1. Store the secrets.** They never go into the image or into source control.

```bash
aws secretsmanager create-secret --name studymate-service-key      --secret-string "<Supabase secret key, sb_secret_...>"
aws secretsmanager create-secret --name studymate-gemini-key       --secret-string "<Gemini API key>"
aws secretsmanager create-secret --name studymate-gemini-audio-key --secret-string "<second Gemini key, or the same one>"
```

Each command prints an ARN ending in a random suffix. `SECRET_ARN_PREFIX` below is their shared start, for example `arn:aws:secretsmanager:ap-south-1:123456789012:secret:studymate`. If the three ARNs differ more than that, edit the `RuntimeEnvironmentSecrets` block in `deploy.sh` and paste each full ARN.

**2. Create two IAM roles (once).**
- **Access role** named `studymate-apprunner-ecr-access`. Trusted entity: `build.apprunner.amazonaws.com`. Attach the managed policy `AWSAppRunnerServicePolicyForECRAccess`. App Runner uses it to pull the image.
- **Instance role** named `studymate-apprunner-instance`. Trusted entity: `tasks.apprunner.amazonaws.com`. Add an inline policy allowing `secretsmanager:GetSecretValue` on the three secrets. App Runner uses it to read them at start-up.

**3. Deploy.**

```bash
export AWS_REGION=ap-south-1
export VITE_SUPABASE_URL=https://<project>.supabase.co
export VITE_SUPABASE_ANON_KEY=<Supabase publishable key>
export INSTANCE_ROLE_ARN=arn:aws:iam::<account>:role/studymate-apprunner-instance
export SECRET_ARN_PREFIX=arn:aws:secretsmanager:<region>:<account>:secret:studymate
bash deploy/deploy.sh
```

The script builds the image, pushes it to ECR, and creates or updates the App Runner service. It prints the service URL.

**Rollback:** deploy an earlier image tag by setting the image in `deploy.sh`, or pick an earlier deployment in the App Runner console.

## Option B: Render

Render has a free plan and builds straight from GitHub, so it is the quickest to set up and costs nothing.

1. In Render, choose **New > Blueprint**, connect your GitHub account, and pick the repository. Render reads `render.yaml` and proposes a service called `studymate-ai` (Docker, Singapore region, free plan).
2. When asked, fill in the values (the file lists them, and secrets are never stored in the repository):

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the Supabase **publishable** key |
   | `SUPABASE_URL` | the same URL as above |
   | `SUPABASE_SERVICE_KEY` | the Supabase **secret** key |
   | `GEMINI_API_KEY` | your Gemini key |
   | `GEMINI_AUDIO_API_KEY` | a second Gemini key, or the same one |

3. Click **Apply**. The first build takes about 5 to 10 minutes. When it says **Live**, open the `https://studymate-ai.onrender.com`-style URL Render shows.

Pushes to the `main` branch deploy automatically.

### The free plan sleeps

A free Render service stops after about 15 minutes with no visitors, and the next visit waits **30 to 60 seconds** while it wakes up. That would spoil a live demonstration. Choose one:

- **Free keep-awake:** create a free monitor at [UptimeRobot](https://uptimerobot.com) (or similar) that requests `https://<your-service>.onrender.com/api/health` every 5 minutes. It keeps the service awake. Render's free plan has a monthly allowance of instance hours that is enough for one service running all month.
- **Paid, for the evaluation:** switch the service to the **Starter** plan (about $7 a month) for the week of the evaluation, then switch back. It never sleeps.
- **Warm it by hand:** open the site about two minutes before you present.

Also on the free plan: 512 MB of memory and a slow share of CPU, so recording a brand-new audio overview is slower than on your laptop. The demo account already has its audio recorded.

## After the first deploy (either platform)

- In Supabase, open **Authentication > URL Configuration**. Set the **Site URL** to your deployed address and add it to the redirect list, so password-reset emails return to the live site.
- Open the URL, sign in with the demo account, and click through summary, flashcards and a quiz.
- `GET /api/health` should return `{"ok": true}`.
- Check speed against the live site: `python scripts/bench.py https://<your-url>` signs in as the demo account and times every page. On a sleeping free Render service the first run will be slow; run it twice.

## Notes

- **Secrets:** only the public Supabase key is built into the website. The service key and Gemini keys are runtime settings on the platform.
- **One instance:** the rate limiter keeps its counts in memory, so run a single instance. With several, each counts separately.
- **Free Gemini limits** apply in production. If students hit them, add billing to the Google project or reorder `GEMINI_FALLBACK_MODELS`.
- **Audio overviews** are generated in a background task inside the container. A very long episode on a small instance can be slow, and a service that goes to sleep mid-job loses it.
