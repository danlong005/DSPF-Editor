**This repository is out of sync with the VS Code extension found in the Marketplace and in OpenVSX**. As we transition to a new DDS renderer, the old renderer is deprecated and replaced with this new real-time DDS editor.

## IBM i Renderer

⚠️ Still in development. Not ready for production.

Adds a real-time visual editor for IBM i display files (DSPF). Opening a `.dspf` file opens the renderer directly - editing a field on the canvas writes the change straight back to the DDS source, and edits made directly in the source are reflected back in the render.

Current capabilities:

- Drag fields on the canvas; edit name, type, length, decimals, display type (input/output/both/hidden), and keywords from the side panels
- Add new fields, constants, and system value fields (date/time/sysname/user) from the toolbox
- Edit format-level and file-level (screen) keywords
- Preview mode: compose multiple record formats together read-only, to see how a screen looks when several formats are written (`WRITE`) without clearing between them (windows, subfiles, and indicator-conditioned fields all included)
- Toggle indicators to preview conditional field/keyword visibility

[See the project board](https://github.com/orgs/codefori/projects/7) for remaining functionality.