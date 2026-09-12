; Keep the assisted installer in the current user's Windows account.
; https://www.electron.build/nsis/#custom-nsis-script
!macro customInstallMode
    StrCpy $isForceCurrentInstall "1"
!macroend
