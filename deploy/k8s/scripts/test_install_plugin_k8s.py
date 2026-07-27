from pathlib import Path


def test_install_plugin_restarts_leantime_before_waiting_for_rollout():
    script = (
        Path(__file__).parents[3] / "scripts" / "install-plugin-k8s.sh"
    ).read_text()

    restart = 'kubectl -n "$NS" rollout restart deploy/leantime'
    wait = 'kubectl -n "$NS" rollout status deploy/leantime'

    assert restart in script
    assert script.index(restart) < script.index(wait)
