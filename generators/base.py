"""Base class for mechanical part generators."""

from abc import ABC, abstractmethod
from pathlib import Path


class PartGenerator(ABC):
    """Abstract base for part generators."""

    @abstractmethod
    def generate(self, output_dir: str) -> list[str]:
        """Generate STL files and return list of output file paths."""
        pass
