# MinIO's pre-built community Docker images are no longer publicly pullable,
# `go install github.com/minio/minio@latest` no longer works (it depends on
# github.com/minio/console and goftp.io, which cannot be fetched), and
# dl.min.io returns 410 Gone.
#
# What still works: the official linux-amd64 binary attached to the
# GitHub release, pinned to a version and verified by SHA-256.
# (Digest taken from the GitHub release asset metadata for
#  minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z.)
FROM alpine:3.20

ARG MINIO_RELEASE=RELEASE.2025-09-07T16-13-09Z
ARG MINIO_SHA256=7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f

RUN apk add --no-cache ca-certificates \
 && apk add --no-cache --virtual .fetch curl \
 && curl -fSL --retry 5 --retry-delay 3 \
      "https://github.com/minio/minio/releases/download/${MINIO_RELEASE}/minio.linux-amd64.${MINIO_RELEASE}" \
      -o /usr/local/bin/minio \
 && echo "${MINIO_SHA256}  /usr/local/bin/minio" | sha256sum -c - \
 && chmod +x /usr/local/bin/minio \
 && apk del .fetch

EXPOSE 9005 9006
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9006", "--address", ":9005"]
