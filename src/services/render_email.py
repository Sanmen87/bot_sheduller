from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent.parent / "mail" / "templates")),
    autoescape=select_autoescape(["html", "xml"]),
)

def render_html(template_name: str, **kwargs) -> str:
    return _env.get_template(template_name).render(**kwargs)