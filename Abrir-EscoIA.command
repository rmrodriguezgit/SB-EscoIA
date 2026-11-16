#!/bin/bash
# Doble clic en Finder: abre EscoIA como app de escritorio. Al cerrarla se libera la memoria.
exec /bin/bash "$(cd -- "$(dirname -- "$0")" && pwd -P)/escoia-desktop.sh"
