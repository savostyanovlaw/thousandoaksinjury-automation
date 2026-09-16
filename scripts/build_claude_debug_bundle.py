from pathlib import Path
import shutil
root=Path('.')
out=Path('/tmp/thousandoaksinjury-claude-debug')
if out.exists(): shutil.rmtree(out)
shutil.copytree(root,out,ignore=shutil.ignore_patterns('.git'))
shutil.make_archive('/tmp/thousandoaksinjury-claude-debug','zip',out)
