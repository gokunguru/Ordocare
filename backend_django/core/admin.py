from django.contrib import admin

from .models import AppUser, File, Prescription, Reminder, Translation

admin.site.register(AppUser)
admin.site.register(File)
admin.site.register(Translation)
admin.site.register(Prescription)
admin.site.register(Reminder)
