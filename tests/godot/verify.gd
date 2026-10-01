extends SceneTree
## Load generated terrain in an isolated Godot project, including static collision creation.

func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Pass the export directory after --")
		quit(1)
		return
	var export_path: String = args[0]
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(export_path.path_join("manifest.json")))
	var loaded: int = 0
	var collision_tiles: int = 0
	var failures: Array[String] = []
	for chunk: Dictionary in manifest["chunks"]:
		for variant: Dictionary in chunk["variants"]:
			var document := GLTFDocument.new()
			var state := GLTFState.new()
			var err: Error = document.append_from_file(export_path.path_join(variant["path"]), state)
			var scene: Node = document.generate_scene(state) if err == OK else null
			if scene == null:
				failures.append(variant["path"])
				continue
			loaded += 1
			if int(variant["stride"]) == 1:
				var meshes: Array[Node] = scene.find_children("*", "MeshInstance3D", true, false)
				if scene is MeshInstance3D:
					meshes.append(scene)
				var made: bool = false
				for node: Node in meshes:
					var mesh_node := node as MeshInstance3D
					var shape: ConcavePolygonShape3D = mesh_node.mesh.create_trimesh_shape()
					if shape != null and not shape.get_faces().is_empty():
						made = true
				if made:
					collision_tiles += 1
				else:
					failures.append("Collision: " + variant["path"])
			scene.free()
	var report: Dictionary = {"engine": Engine.get_version_info()["string"], "loaded_glbs": loaded, "collision_tiles": collision_tiles, "failed": failures, "world_size_m": manifest["settings"]["worldSize"], "resolution": manifest["settings"]["resolution"]}
	var file := FileAccess.open(export_path.path_join("godot-validation.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "  "))
	file.close()
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
