from django.urls import include, path

urlpatterns = [
    path("", include("polaris.urls")),
]
