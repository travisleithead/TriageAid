# TriageAid
The form-filler for visualstudio.com common Triage fields

## Installation Notes
Long-term this will be an Edge Extension. For now:

1. Copy the contents of `content.js` to the clipboard
2. Navigate to your visualstudio.com site (e.g., https://microsoft.visualstudio.com/DefaultCollection/OS/ft_iep_dom/)
3. Open the F12 tools to the Console
4. Switch the console input to multi-line (this may not be a necessary step, but I do it anyway)
5. Paste in the clipboard contents
6. Press Ctrl+Enter (or hit the green run button)

You should see the TriageAid extension UI appear in the top-center of the window.

## Usage
Just triage like normal. The Triage-Aid will record some of the fields you edit and let you know that it is doing so by flashing the `[+]` button in yellow. If you would like to save the current fields edits for later re-use, just press the `[+]` button (or `Alt+Shift+A`). A flyout will display what fields were recorded and their corresponding value. Type in a label for this new template, and press Enter (or click `[Add]`). The template is saved and can be activated by clicking its button or using `Alt+Shift+#` where `#` is the number the template is prefixed with. To clear a prevously-saved template, press the `[-]` button (or `Alt+Shift+R`), then press the template you'd like to remove.
