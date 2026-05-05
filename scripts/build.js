const { build } = require('electron-builder');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

async function cleanDist() {
  if (fs.existsSync(DIST_DIR)) {
    console.log('🧹 Dọn dẹp thư mục dist cũ...');
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
}

async function buildTarget(target) {
  console.log(`🔨 Đang build target: ${target} ...`);
  const result = await build({
    targets: require('electron-builder').Platform.WINDOWS.createTarget(target, 'x64'),
    config: {
      appId: 'com.clawrouter.manager',
      productName: 'Claw Router Manager',
      directories: { output: 'dist' },
      files: [
        'src/main/**/*',
        'src/renderer/**/*',
        'index.html',
        'style.css',
        'icon.png',
        'icon.ico',
        'node_modules/**/*',
        'package.json'
      ],
      win: {
        icon: 'icon.ico',
        requestedExecutionLevel: 'requireAdministrator'
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Claw Router Manager'
      },
      portable: {
        artifactName: '${productName}-Portable-${version}.${ext}'
      }
    }
  });
  console.log(`✅ Build ${target} hoàn tất.`);
  return result;
}

async function listOutputs() {
  if (!fs.existsSync(DIST_DIR)) return;
  const files = fs.readdirSync(DIST_DIR);
  if (files.length === 0) return;
  console.log('\n📦 Các file đã được tạo trong thư mục dist:');
  files.forEach(f => {
    const fpath = path.join(DIST_DIR, f);
    const stats = fs.statSync(fpath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   - ${f} (${sizeMB} MB)`);
  });
}

(async () => {
  try {
    await cleanDist();

    await buildTarget('nsis');
    await buildTarget('portable');

    await listOutputs();
    console.log('\n🎉 Đóng gói hoàn tất! Kiểm tra thư mục dist/');
  } catch (err) {
    console.error('\n❌ Lỗi trong quá trình build:', err.message);
    process.exit(1);
  }
})();
