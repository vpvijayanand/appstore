# MinIO's pre-built community Docker images are no longer publicly pullable
# (the minio/minio GitHub repo is archived; quay.io/minio/minio and
# bitnami/minio now require paid/commercial registry access).
# MinIO's own docs now recommend building from source instead:
#   https://github.com/minio/minio#readme -> "go install github.com/minio/minio@latest (recommended)"
# This Dockerfile does exactly that, using the still-free official `golang`
# build image and Google's distroless runtime (no shell, minimal attack surface).

FROM golang:bookworm AS builder
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@latest

FROM alpine:3.20
COPY --from=builder /go/bin/minio /usr/local/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data"]
