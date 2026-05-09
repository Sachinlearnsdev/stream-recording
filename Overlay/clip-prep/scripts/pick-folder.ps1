# pick-folder.ps1
# Modern Windows folder picker (IFileDialog with FOS_PICKFOLDERS) — looks like
# File Explorer (sidebar, address bar, full navigation).
#
# Uses GetForegroundWindow() as the dialog parent, so it appears in front of
# whatever window the user has focused (their browser with setup.html, etc).
# This means we don't need a visible PowerShell console — runs silently.

param(
  [Parameter(Mandatory=$true)][string]$OutFile,
  [string]$Description = 'Select a folder'
)

$cs = @'
using System;
using System.Runtime.InteropServices;

namespace ClipPrep
{
    public static class FolderPicker
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        public static string Pick(string title)
        {
            IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialog();
            uint options;
            dialog.GetOptions(out options);
            // FOS_PICKFOLDERS (0x20) | FOS_FORCEFILESYSTEM (0x40)
            dialog.SetOptions(options | 0x20 | 0x40);
            if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);

            // Anchor to the user's currently-focused window (likely the browser
            // with setup.html). The dialog appears modal to it — fully visible,
            // no need for our PowerShell to have its own visible console.
            IntPtr parent = GetForegroundWindow();
            if (dialog.Show(parent) != 0) return null;

            IShellItem item;
            dialog.GetResult(out item);
            string path;
            item.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
            return path;
        }
    }

    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"), ClassInterface(ClassInterfaceType.None)]
    internal class FileOpenDialog { }

    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileOpenDialog
    {
        // IModalWindow
        [PreserveSig] int Show(IntPtr parent);
        // IFileDialog
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr sink, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem psi);
        void GetCurrentSelection(out IShellItem psi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem psi);
        void AddPlace(IShellItem psi, uint alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
        // IFileOpenDialog
        void GetResults();
        void GetSelectedItems();
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem psi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string name);
        void GetAttributes(uint mask, out uint attrs);
        void Compare(IShellItem psi, uint hint, out int order);
    }
}
'@

Add-Type -TypeDefinition $cs

$path = [ClipPrep.FolderPicker]::Pick($Description)
if ($path) {
    [System.IO.File]::WriteAllText($OutFile, $path, (New-Object System.Text.UTF8Encoding $false))
}
