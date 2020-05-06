from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    stripe_id = models.CharField(
        max_length=100
    )
