#!/usr/bin/env bash
# Build the image, push it to Amazon ECR, and create or update the AWS App Runner service.
#
# Prerequisites: AWS CLI v2 signed in (aws configure), Docker running, and the three secrets stored in
# AWS Secrets Manager (see deploy/README.md). Nothing here is run automatically.
#
#   export AWS_REGION=ap-south-1
#   export VITE_SUPABASE_URL=https://xxxx.supabase.co
#   export VITE_SUPABASE_ANON_KEY=sb_publishable_...
#   export INSTANCE_ROLE_ARN=arn:aws:iam::123456789012:role/studymate-apprunner-instance
#   export SECRET_ARN_PREFIX=arn:aws:secretsmanager:ap-south-1:123456789012:secret:studymate
#   bash deploy/deploy.sh
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION}" "${VITE_SUPABASE_URL:?}" "${VITE_SUPABASE_ANON_KEY:?}" "${INSTANCE_ROLE_ARN:?}" "${SECRET_ARN_PREFIX:?}"
APP=studymate
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$REGISTRY/$APP:$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"

echo "==> Preparing the ECR repository"
aws ecr describe-repositories --repository-names "$APP" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$APP" --region "$AWS_REGION" --image-scanning-configuration scanOnPush=true >/dev/null

echo "==> Building $IMAGE"
docker build --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t "$IMAGE" .

echo "==> Pushing"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker push "$IMAGE"

# App Runner pulls from ECR with this role. Create it once: see deploy/README.md, step 3.
ACCESS_ROLE_ARN="arn:aws:iam::$ACCOUNT:role/studymate-apprunner-ecr-access"

CONFIG=$(cat <<JSON
{
  "ImageRepository": {
    "ImageIdentifier": "$IMAGE",
    "ImageRepositoryType": "ECR",
    "ImageConfiguration": {
      "Port": "8080",
      "RuntimeEnvironmentVariables": {
        "SUPABASE_URL": "$VITE_SUPABASE_URL",
        "GEMINI_MODEL": "gemini-3.6-flash"
      },
      "RuntimeEnvironmentSecrets": {
        "SUPABASE_SERVICE_KEY": "$SECRET_ARN_PREFIX-service-key",
        "GEMINI_API_KEY": "$SECRET_ARN_PREFIX-gemini-key",
        "GEMINI_AUDIO_API_KEY": "$SECRET_ARN_PREFIX-gemini-audio-key"
      }
    }
  },
  "AuthenticationConfiguration": { "AccessRoleArn": "$ACCESS_ROLE_ARN" },
  "AutoDeploymentsEnabled": false
}
JSON
)

SERVICE_ARN=$(aws apprunner list-services --region "$AWS_REGION" --query "ServiceSummaryList[?ServiceName=='$APP'].ServiceArn | [0]" --output text)
if [ "$SERVICE_ARN" = "None" ] || [ -z "$SERVICE_ARN" ]; then
  echo "==> Creating the App Runner service"
  aws apprunner create-service --region "$AWS_REGION" --service-name "$APP" \
    --source-configuration "$CONFIG" \
    --instance-configuration "Cpu=1024,Memory=2048,InstanceRoleArn=$INSTANCE_ROLE_ARN" \
    --health-check-configuration "Protocol=HTTP,Path=/api/health,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=5" \
    --query "Service.ServiceUrl" --output text
else
  echo "==> Updating the App Runner service"
  aws apprunner update-service --region "$AWS_REGION" --service-arn "$SERVICE_ARN" --source-configuration "$CONFIG" >/dev/null
  aws apprunner describe-service --region "$AWS_REGION" --service-arn "$SERVICE_ARN" --query "Service.ServiceUrl" --output text
fi
echo "Done. After it reports RUNNING, add the service URL to Supabase: Authentication > URL Configuration."
