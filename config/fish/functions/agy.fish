function agy --description="Run agy through usage-capture proxy"
    set -l agy_bin (command -v agy)
    if test -z "$agy_bin"
        echo "agy: command not found" >&2
        return 1
    end
    env HTTPS_PROXY=http://localhost:8080 HTTP_PROXY=http://localhost:8080 $agy_bin $argv
end
