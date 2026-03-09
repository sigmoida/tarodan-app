# S3 Bucket Policy for Public Product/Collection Images

Product and collection images are served directly from S3. The bucket must allow public `GetObject` for these prefixes.

## Apply via AWS Console

1. Open **S3** → bucket **amzn-tarodan** → **Permissions** → **Bucket policy**
2. If the bucket already has a policy, merge the `Statement` from `s3-bucket-policy-public-read.json` into the existing policy.
3. If the bucket has no policy, paste the full contents of `s3-bucket-policy-public-read.json`.

## Apply via AWS CLI

```bash
aws s3api put-bucket-policy --bucket amzn-tarodan --policy file://infra/s3-bucket-policy-public-read.json
```

**Note:** This replaces the entire bucket policy. If you have other statements, merge them manually first.

## Block Public Access

Ensure **Block public access** settings allow this policy:

- **Block public access to buckets and objects granted through new access control lists (ACLs)** – can stay ON
- **Block public access to buckets and objects granted through any access control lists (ACLs)** – can stay ON
- **Block public access to buckets and objects granted through new public bucket or access point policies** – must be OFF (or the policy will not take effect)
- **Block public and cross-account access to buckets and objects through any public bucket or access point policies** – must be OFF
