from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Teacher, University, Course, ExerciseSeries, ExerciseFile, Submission, SubmissionFile, AuditLog
admin.site.register(Teacher, UserAdmin)
admin.site.register(University)
admin.site.register(Course)
class ExerciseFileInline(admin.TabularInline):
    model = ExerciseFile
    extra = 0
@admin.register(ExerciseSeries)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("title", "teacher", "course", "status", "created_at")
    list_filter = ("status", "course")
    inlines = [ExerciseFileInline]
admin.site.register(Submission)
admin.site.register(SubmissionFile)
admin.site.register(AuditLog)
