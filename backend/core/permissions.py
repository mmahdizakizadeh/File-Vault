from rest_framework.permissions import BasePermission
class IsExerciseOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return bool(request.user.is_authenticated and obj.teacher_id == request.user.id)
