$nodeFolder = Get-ChildItem "$PWD\tools\node" -Directory | Select-Object -First 1
$env:Path = "$($nodeFolder.FullName);$env:Path"
$gitExe = Get-ChildItem -Path "$PWD\tools\git" -Filter "git.exe" -Recurse | Select-Object -First 1
$env:Path = "$($gitExe.DirectoryName);$env:Path"
$env:NETLIFY_AUTH_TOKEN = "nfp_gAyvjpSZ98yM4GCarvt6hFeGyCR5GZaff49f"
$syncTmp = "$env:TEMP\costuraflow-sync"
Remove-Item $syncTmp -Recurse -Force -ErrorAction SilentlyContinue
git clone --depth 1 --branch claude/ficha-tecnica-web-link-dift9d https://github.com/fernandossb/APLICATIVO-VIDEOS.git $syncTmp
robocopy "$syncTmp\web\src" "src" /MIR
robocopy "$syncTmp\web\netlify" "netlify" /MIR
robocopy "$syncTmp\web\supabase" "supabase" /MIR
Copy-Item "$syncTmp\web\README.md" "README.md" -Force
Copy-Item "$syncTmp\web\.env.example" ".env.example" -Force
Remove-Item $syncTmp -Recurse -Force
npm.cmd run build
node .\node_modules\netlify-cli\bin\run.js deploy --prod --dir=dist --auth $env:NETLIFY_AUTH_TOKEN --site 248bd627-58d3-4e1a-995f-7f940a1c7e06