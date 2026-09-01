from mangum import Mangum

from synchro.app import create_app

app = create_app()
handler = Mangum(app, lifespan="auto")
