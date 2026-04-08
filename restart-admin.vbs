Set objShell = CreateObject("Shell.Application")
objShell.ShellExecute "cmd.exe", "/c cd /d ""D:\BaiTapSinhVien\AI Agent\Manager_Claw"" && npm start", "", "runas", 1