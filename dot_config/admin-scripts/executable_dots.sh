#!/bin/bash
# Dotfiles management helper script
# Usage: dots [command]

set -e

CHEZMOI_DIR="$HOME/.local/share/chezmoi"

case "${1:-status}" in
	apply|a)
		chezmoi apply -v
		;;
		
	edit|e)
		chezmoi edit "$2"
		;;
		
	add)
		chezmoi add "$2"
		;;
		
	status|s)
		chezmoi status
		;;
		
	diff|d)
		chezmoi diff
		;;
		
	cd)
		cd "$CHEZMOI_DIR" && exec $SHELL
		;;
		
	git|g)
		shift
		cd "$CHEZMOI_DIR" && git "$@"
		;;
		
	push)
		cd "$CHEZMOI_DIR" && git add -A && git commit -m "$(date '+%Y-%m-%d %H:%M:%S')" && git push
		;;
		
	update|u)
		cd "$CHEZMOI_DIR" && git pull && chezmoi apply
		;;
		
	re-add)
		chezmoi re-add
		;;
		
	destroy)
		read -p "Really destroy chezmoi? This removes all dotfiles tracking (y/N) " -n 1 -r
		echo
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			chezmoi destroy
		fi
		;;
		
	help|h|*)
		cat << 'EOF'
Dotfiles management helper

Commands:
  apply, a          Apply dotfiles (default)
  edit <file>, e    Edit a dotfile with chezmoi
  add <file>        Add a file to chezmoi
  status, s         Show chezmoi status
  diff, d           Show diff
  cd                Open shell in chezmoi source directory
  git, g <cmd>      Run git command in chezmoi repo
  push              Commit all changes and push to remote
  update, u         Pull latest and apply
  re-add            Re-add modified files
  destroy           Remove chezmoi (dangerous)
  help, h           Show this help

Examples:
  dots add ~/.config/nvim/init.lua
  dots edit ~/.zshrc
  dots git log --oneline -5
EOF
		;;
esac
