#!/usr/bin/env bash
# Generate throwaway development certificates for the SHADi verifier: a CA, the
# server certificate, and one client certificate per host URI SAN given as an
# argument. Local development only; never use these anywhere else.
#
#   enforcement/shadi/gen-dev-certs.sh spiffe://ioc.example/hosts/sender spiffe://ioc.example/hosts/receiver
#
# Output goes to enforcement/shadi/config (or $OUT_DIR): ca.crt, server.crt,
# server.key and one <name>.crt/<name>.key per host, named after the URI's last
# path segment. Files are made world-readable because the verifier image runs as
# UID/GID 65532. Existing files are never overwritten.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="${OUT_DIR:-${root}/enforcement/shadi/config}"
server_dns="${SERVER_DNS:-ioc-scale-enforcement-proxy-shadi-verifier}"
days="${CERT_DAYS:-30}"

[[ $# -ge 1 ]] || { echo "usage: $0 <host-spiffe-uri>..." >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 2; }
mkdir -p "${out}"
for f in ca.crt server.crt server.key; do
  [[ ! -e "${out}/${f}" ]] || { echo "refusing to overwrite ${out}/${f}" >&2; exit 2; }
done

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days "${days}" -subj "/CN=ioc-dev-ca" \
  -keyout "${work}/ca.key" -out "${out}/ca.crt" 2>/dev/null

issue() { # name subjectAltName extendedKeyUsage
  local name="$1" san="$2" eku="$3"
  openssl req -newkey rsa:2048 -nodes -subj "/CN=${name}" \
    -keyout "${out}/${name}.key" -out "${work}/${name}.csr" 2>/dev/null
  printf 'subjectAltName=%s\nextendedKeyUsage=%s\n' "${san}" "${eku}" > "${work}/${name}.ext"
  openssl x509 -req -in "${work}/${name}.csr" -CA "${out}/ca.crt" -CAkey "${work}/ca.key" \
    -CAserial "${work}/ca.srl" -CAcreateserial -days "${days}" -extfile "${work}/${name}.ext" -out "${out}/${name}.crt" 2>/dev/null
}

issue server "DNS:${server_dns},DNS:localhost,IP:127.0.0.1" serverAuth
for uri in "$@"; do
  name="$(basename "${uri}")"
  [[ "${uri}" == spiffe://* && -n "${name}" ]] || { echo "not a SPIFFE URI: ${uri}" >&2; exit 2; }
  [[ ! -e "${out}/${name}.crt" ]] || { echo "refusing to overwrite ${out}/${name}.crt" >&2; exit 2; }
  issue "${name}" "URI:${uri}" clientAuth
done
chmod 644 "${out}"/*.crt "${out}"/*.key
echo "wrote certificates to ${out}"
