; Wisdom Stream - Windows installer (NSIS)
; Build: npm run build:installer   ->  dist/WisdomStream-Setup.exe

Unicode true
!include "MUI2.nsh"

!define APP_NAME      "Wisdom Stream"
!define APP_EXE       "WisdomStream.exe"
!define APP_VERSION   "1.0.0"
!define APP_PUBLISHER "Fardeen Bukhari"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\WisdomStream"

Name "${APP_NAME}"
OutFile "..\dist\WisdomStream-Setup.exe"
; Per-user install: no admin password needed, and the videos folder stays writable
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\WisdomStream" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "${APP_PUBLISHER}"

!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Watch videos together with friends, perfectly in sync.$\r$\n$\r$\nThis will install ${APP_NAME} ${APP_VERSION} on your computer. No admin rights are needed.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME} now"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\HOW-TO-USE.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Show how to use"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
    ; Close a running copy so its files can be replaced
    nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
    Sleep 500

    SetOutPath "$INSTDIR"
    File "..\dist\${APP_EXE}"
    File "icon.ico"
    File "HOW-TO-USE.txt"
    CreateDirectory "$INSTDIR\videos"

    ; Shortcuts (working directory = install folder)
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\My Videos Folder.lnk" "$INSTDIR\videos"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\How to use.lnk" "$INSTDIR\HOW-TO-USE.txt"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico"

    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Show up in Settings > Apps
    WriteRegStr HKCU "Software\WisdomStream" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" 60000
SectionEnd

Section "Uninstall"
    nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
    Sleep 500

    Delete "$INSTDIR\${APP_EXE}"
    Delete "$INSTDIR\icon.ico"
    Delete "$INSTDIR\HOW-TO-USE.txt"
    Delete "$INSTDIR\Uninstall.exe"
    ; Keeps the videos folder if you put your own videos in it
    RMDir "$INSTDIR\videos"
    RMDir "$INSTDIR"

    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"

    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    DeleteRegKey HKCU "Software\WisdomStream"
SectionEnd
