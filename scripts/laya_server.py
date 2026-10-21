"""Bound MLX allocator cache; server is only reachable over loopback."""
import runpy
import mlx.core as mx
mx.set_cache_limit(256 * 1024 * 1024)
mx.set_memory_limit(3 * 1024 * 1024 * 1024)
runpy.run_module('mlx_lm.server', run_name='__main__')
