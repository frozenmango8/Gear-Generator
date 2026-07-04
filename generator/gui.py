"""Tkinter desktop GUI for the LEGO gear generator.

The GUI contains NO geometry logic. It collects parameters, calls
generate_lego_gear(), and saves the result via a file dialog.

Run:  python -m generator.gui
"""

from __future__ import annotations

import tkinter as tk
from tkinter import filedialog, ttk

from .common import GearParams, SUPPORTED_TEETH, PLATE_MM
from .gears import generate_lego_gear, GearValidationError
from .common import export_stl


class GearApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("LEGO Gear Generator")
        root.resizable(False, False)

        pad = {"padx": 10, "pady": 6}
        frm = ttk.Frame(root, padding=16)
        frm.grid(sticky="nsew")

        ttk.Label(frm, text="LEGO Technic-compatible gear", font=("", 13, "bold")) \
            .grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 12))

        # Teeth dropdown
        ttk.Label(frm, text="Teeth").grid(row=1, column=0, sticky="w", **pad)
        self.teeth = tk.StringVar(value="24")
        ttk.Combobox(
            frm, textvariable=self.teeth, state="readonly", width=12,
            values=[str(t) for t in SUPPORTED_TEETH],
        ).grid(row=1, column=1, sticky="w", **pad)

        # Thickness in plate units
        ttk.Label(frm, text="Thickness (plate units)").grid(row=2, column=0, sticky="w", **pad)
        self.thickness = tk.StringVar(value="1")
        ttk.Spinbox(
            frm, from_=1, to=10, increment=1, textvariable=self.thickness, width=11,
        ).grid(row=2, column=1, sticky="w", **pad)

        # Bore type
        ttk.Label(frm, text="Bore type").grid(row=3, column=0, sticky="nw", **pad)
        self.bore = tk.StringVar(value="cross_axle")
        bore_frm = ttk.Frame(frm)
        bore_frm.grid(row=3, column=1, sticky="w", **pad)
        ttk.Radiobutton(bore_frm, text="Cross axle (+ shaped)", value="cross_axle",
                        variable=self.bore).grid(row=0, column=0, sticky="w")
        ttk.Radiobutton(bore_frm, text="Pin hole (round)", value="pin_hole",
                        variable=self.bore).grid(row=1, column=0, sticky="w")

        # Generate button
        ttk.Button(frm, text="Generate STL…", command=self.on_generate) \
            .grid(row=4, column=0, columnspan=2, sticky="ew", padx=10, pady=(14, 4))

        # Status / error label
        self.status = tk.StringVar(value="")
        self.status_label = ttk.Label(frm, textvariable=self.status, wraplength=280,
                                      foreground="#a12", justify="left")
        self.status_label.grid(row=5, column=0, columnspan=2, sticky="w", padx=10, pady=(2, 0))

    def _read_params(self) -> GearParams:
        try:
            teeth = int(self.teeth.get())
        except ValueError:
            raise GearValidationError("Teeth must be a whole number.")
        try:
            thickness = float(self.thickness.get())
        except ValueError:
            raise GearValidationError("Thickness must be a number of plate units.")
        return GearParams(
            teeth=teeth,
            thickness_units=thickness,
            bore_type=self.bore.get(),
        )

    def on_generate(self) -> None:
        self.status_label.configure(foreground="#a12")
        try:
            params = self._read_params()
            mesh = generate_lego_gear(params)          # validates internally
        except GearValidationError as exc:
            self.status.set(str(exc))
            return

        default_name = f"lego_gear_{params.teeth}t_{params.bore_type}.stl"
        path = filedialog.asksaveasfilename(
            defaultextension=".stl",
            initialfile=default_name,
            filetypes=[("STL model", "*.stl")],
            title="Save gear STL",
        )
        if not path:
            self.status.set("")
            return

        export_stl(mesh, path)
        thick_mm = params.thickness_units * PLATE_MM
        self.status_label.configure(foreground="#161")
        self.status.set(
            f"Saved {params.teeth}t gear ({thick_mm:.1f} mm thick) to:\n{path}"
        )


def main() -> None:
    root = tk.Tk()
    GearApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
