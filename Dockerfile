FROM denoland/deno:latest AS builder
WORKDIR /app
COPY . .

RUN deno install

FROM denoland/deno:latest
WORKDIR /app

COPY --from=builder /app .
CMD ["deno", "run", "-A", "--env", "src/main.ts"]
