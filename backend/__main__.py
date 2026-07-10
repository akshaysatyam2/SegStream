"""
SegStream Backend — Package Runner
====================================

Allows the backend to be executed as a module::

    python -m backend

This delegates to ``backend.server.main()``.

Author: Akshay
"""

from .server import main

if __name__ == "__main__":
    main()
