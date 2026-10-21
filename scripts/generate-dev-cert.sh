#!/usr/bin/env bash
# Genera un certificado autofirmado para NGINX en desarrollo (TSK-DEV2-403).
# Los archivos quedan en infra/nginx/certs/ y NO se suben al repositorio.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/infra/nginx/certs"
mkdir -p "$DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/frogpay.key" -out "$DIR/frogpay.crt" \
  -subj "/C=BO/O=FrogPay Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 600 "$DIR/frogpay.key"
echo "Certificado generado en $DIR (válido 365 días)."
