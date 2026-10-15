import sys
from os import getenv, path
from pathlib import Path
from django.core.management.utils import get_random_secret_key
import dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

dotenv_file = BASE_DIR / '.env'

if path.isfile(dotenv_file):
    dotenv.load_dotenv(dotenv_file)

DEVELOPEMENT_MODE = getenv('DEVELOPEMENT_MODE', 'False') == 'True'

SECRET_KEY = getenv('DJANGO_SECRET_KEY', get_random_secret_key())

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = getenv("DEBUG", 'False') == 'True'

ALLOWED_HOSTS = getenv('DJANGO_ALLOWED_HOSTS',
                       '127.0.0.1,localhost').split(',')

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',  

    # third party apps
    'rest_framework',
    'drf_spectacular',
    # base django apps

    # content django apps

]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'koralle.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'koralle.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases
#if DEVELOPEMENT_MODE is True:
#elif len(sys.argv) > 0 and sys.argv[1] != 'collectstatic':
if DEVELOPEMENT_MODE is True:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
elif len(sys.argv) > 0 and sys.argv[1] != 'collectstatic':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            "NAME": getenv('POSTGRES_NAME'),
            "USER": getenv('POSTGRES_USER'),
            "PASSWORD": getenv('POSTGRES_PASSWORD'),
            "HOST": getenv('POSTGRES_HOST'),
            "PORT": getenv('POSTGRES_PORT'),
        }
    }

DOMAIN = getenv('DOMAIN')
SITE_NAME = getenv('SITE_NAME')
    
# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'static'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Authentication Backends and REST Framework configurations

AUTHENTICATION_BACKENDS = [

]

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# CORS configurations
CORS_ALLOWED_ORIGINS = getenv(
    'CORS_ALLOWED_ORIGINS', 
    'http://localhost:3000,http://127.0.0.1:3000'
).split(',')

CORS_ALLOW_CREDENTIALS = True


# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Swagger UI settings
SPECTACULAR_SETTINGS = {
    'TITLE': 'KORALLE API',
    'DESCRIPTION': 'This is the API documentation for the KORALLE project.',
    'VERSION': '0.0.1',
    'SERVE_INCLUDE_SCHEMA': False,
    # OTHER SETTINGS
}

# Logging settings

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'detailed': {
            'format': '{levelname} [{asctime}]{name} :  {message}',
            'style': '{',
        },
    },
    'handlers': {
            'console': {
                'level': 'DEBUG',
                'class': 'logging.StreamHandler',
                'formatter': 'detailed'
            },
            'file': {
                'level': 'INFO',
                'class': 'logging.FileHandler',
                'filename': "logs/info.log",
            },
            'performance': {
                'level': 'INFO',
                'class': 'logging.FileHandler',
                'filename': "logs/performance.log"
            }
    },
    'loggers': {
        '': {
            'handlers': ['console'],
            'propagate': False,
            'level': 'WARNING',
        },
        'errors': {
            'handlers': ['console'],
            'propagate': False,
            'level': 'ERROR'
        },
        'logToFile': {
            'handlers': ['file','console'],
            'propagate': False,
            'level': 'INFO',
        },
        'performance': {
            'handlers': ['performance', 'console'],
            'propagate': False,
            'level': 'INFO'
        },
        'django': {
            'handlers': ['console'],
            'propagate': False,
            'level': 'INFO',
        },
        'django_debug': {
            'handlers': ['console'],
            'propagate': False,
            'level': getenv('DJANGO_LOG_LEVEL', 'WARNING'),
        },
        # django.template and django.backends must not use DEBUG-level, since it is buggy
        'django.template': {
            'propagate': True,
            'level': 'INFO',
        },
        'django.db.backends': {
            'propagate': True,
            'level': 'INFO',
        },
        # use same format for logs from uvicorn
        'uvicorn': {
            'handlers': ['console'],
            'propagate': False,
            'level': 'INFO',
        },
    }
}