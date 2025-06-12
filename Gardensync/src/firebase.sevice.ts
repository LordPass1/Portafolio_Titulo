import { Injectable } from '@angular/core';
import { collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, increment, query, orderBy } from 'firebase/firestore';
import { FirebaseInitService } from './firebase-init.service';  // Importa el servicio
import { createUserWithEmailAndPassword, Auth, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private db;
  private auth: Auth;
  private storage;

  constructor(private firebaseInitService: FirebaseInitService) {
    this.db = firebaseInitService.db;
    this.auth = firebaseInitService.auth;
    this.storage = firebaseInitService.storage;
  }

  // Método para registrar usuario
  async registro(nombreCompleto: string, correo: string, contraseña: string) {
  try {
    const currentUser = this.auth.currentUser;

    // Crear credenciales con email y contraseña
    const credential = EmailAuthProvider.credential(correo, contraseña);

    let userCredential;

    if (currentUser && currentUser.isAnonymous) {
      // Vincular usuario anónimo con las credenciales de registro
      userCredential = await linkWithCredential(currentUser, credential);
    } else {
      // Si no hay usuario anónimo, crea cuenta nueva normal
      userCredential = await createUserWithEmailAndPassword(this.auth, correo, contraseña);
    }

    const uid = userCredential.user.uid;

    // Guardar datos en Firestore (si es la primera vez, puede que quieras verificar si ya existe)
    const personaRef = doc(this.db, 'Personas', uid);
    await setDoc(personaRef, {
      nombreCompleto,
      correo,
    });

    return uid;

  } catch (error: any) {
    // Manejo de errores igual que antes
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/email-already-in-use':
          throw new Error('El correo electrónico ya está en uso.');
        case 'auth/weak-password':
          throw new Error('La contraseña debe tener al menos 6 caracteres.');
        case 'auth/invalid-email':
          throw new Error('El correo electrónico no tiene un formato válido.');
        case 'auth/operation-not-allowed':
          throw new Error('El registro con correo y contraseña no está habilitado en Firebase.');
        default:
          throw new Error('Ocurrió un error desconocido: ' + error.code);
      }
    } else {
      console.error('Error no reconocido:', error);
      throw new Error('Error inesperado. Revisa la consola para más detalles.');
    }
  }
}

  async crearPublicacion(contenido: string) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Usuario no autenticado');

    const personaRef = doc(this.db, `Personas/${user.uid}`);
    const personaSnap = await getDoc(personaRef);
    if (!personaSnap.exists()) throw new Error('Datos de la persona no encontrados');

    const { nombreCompleto } = personaSnap.data() as any;

    const publicacionesRef = collection(this.db, 'Publicaciones');
    await addDoc(publicacionesRef, {
      uidPersona: user.uid,
      nombre: nombreCompleto,
      contenido: contenido,
      fecha: new Date(),
      likes: 0,
      dislikes: 0
    });
  }

  async obtenerPublicaciones() {
    const publicacionesRef = collection(this.db, 'Publicaciones');
    const q = query(publicacionesRef, orderBy('fecha', 'desc'));
    const publicacionesSnap = await getDocs(q);

    return publicacionesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async comentar(publicacionId: string, contenido: string) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Usuario no autenticado');

    const personaRef = doc(this.db, `Personas/${user.uid}`);
    const personaSnap = await getDoc(personaRef);
    if (!personaSnap.exists()) throw new Error('Datos de la persona no encontrados');

    const { nombreCompleto } = personaSnap.data() as any;

    const comentariosRef = collection(this.db, `Publicaciones/${publicacionId}/Comentarios`);
    await addDoc(comentariosRef, {
      uidPersona: user.uid,
      nombre: nombreCompleto,
      contenido: contenido,
      fecha: new Date()
    });
  }

  async obtenerComentarios(publicacionId: string) {
    const comentariosRef = collection(this.db, `Publicaciones/${publicacionId}/Comentarios`);
    const q = query(comentariosRef, orderBy('fecha', 'desc'));
    const comentariosSnap = await getDocs(q);

    return comentariosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async darLike(publicacionId: string) {
    const publicacionRef = doc(this.db, `Publicaciones/${publicacionId}`);
    await updateDoc(publicacionRef, {
      likes: increment(1)
    });
  }

  async darDislike(publicacionId: string) {
    const publicacionRef = doc(this.db, `Publicaciones/${publicacionId}`);
    await updateDoc(publicacionRef, {
      dislikes: increment(1)
    });
  }
  // Agrega un hogar dentro de una persona
  async addHogar(idPersona: string, nombreHogar: string) {
    const hogaresRef = collection(this.db, `Personas/${idPersona}/Hogares`);
    const newHogar = { nombreHogar };
    const hogarDoc = await addDoc(hogaresRef, newHogar);
    return hogarDoc.id;
  }

  async addGrupoToUserHogar(uid: string, nombreGrupo: string) {
    // Obtén el hogar del usuario
    const hogaresRef = collection(this.db, `Personas/${uid}/Hogares`);
    const hogaresSnap = await getDocs(hogaresRef);
    if (hogaresSnap.empty) throw new Error('No hay hogar creado');
    const hogarId = hogaresSnap.docs[0].id;

    // Agrega el grupo como subcolección del hogar
    const gruposRef = collection(this.db, `Personas/${uid}/Hogares/${hogarId}/Grupos`);
    await addDoc(gruposRef, { nombre: nombreGrupo });
  }

  // Agrega una maceta dentro de un grupo
  async addMaceta(
    idPersona: string,
    idHogar: string,
    idGrupo: string,
    nombrePlanta: string,
    temperatura: number,
    humedad: number,
    nivelAgua: number,
    estado: string
  ) {
    try {
      const macetasRef = collection(this.db, `Personas/${idPersona}/Hogares/${idHogar}/Grupos/${idGrupo}/Macetas`);
      const newMaceta = { nombrePlanta, temperatura, humedad, nivelAgua, estado };
      const docRef = await addDoc(macetasRef, newMaceta);
      console.log("Maceta creada con ID:", docRef.id);
    } catch (error) {
      console.error("Error al crear maceta:", error);
    }
  }

  // tener datos de la persona
  async obtenerDatosPersona() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Usuario no autenticado');

    const docRef = doc(this.db, `Personas/${user.uid}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      throw new Error('Datos de la persona no encontrados');
    }
  }
  async obtenerHogarUsuario() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Usuario no autenticado');

    const hogaresRef = collection(this.db, `Personas/${user.uid}/Hogares`);
    const querySnapshot = await getDocs(hogaresRef);

    if (!querySnapshot.empty) {
      const hogarDoc = querySnapshot.docs[0];
      return {
        id: hogarDoc.id,       // El id del documento
        ...hogarDoc.data()     // Los datos del documento
      };
    } else {
      throw new Error('No se encontró ningún hogar registrado');
    }
  }

  // Obtener los grupos del usuario y la cantidad de macetas en cada uno
  async obtenerGruposYMacetas() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Usuario no autenticado');

    const gruposConMacetas: any[] = [];

    // Obtener ID del hogar
    const hogaresRef = collection(this.db, `Personas/${user.uid}/Hogares`);
    const hogaresSnap = await getDocs(hogaresRef);
    if (hogaresSnap.empty) return [];
    const hogarId = hogaresSnap.docs[0].id;

    // Obtener los grupos
    const gruposRef = collection(this.db, `Personas/${user.uid}/Hogares/${hogarId}/Grupos`);
    const gruposSnap = await getDocs(gruposRef);

    for (const grupoDoc of gruposSnap.docs) {
      const grupoId = grupoDoc.id;
      const grupoData = grupoDoc.data();

      // Contar las macetas dentro del grupo
      const macetasRef = collection(this.db, `Personas/${user.uid}/Hogares/${hogarId}/Grupos/${grupoId}/Macetas`);
      const macetasSnap = await getDocs(macetasRef);
      const cantidadMacetas = macetasSnap.size;

      gruposConMacetas.push({
        id: grupoId,
        nombre: grupoData['nombre'] || 'Sin nombre',
        cantidadMacetas: cantidadMacetas
      });
    }

    return gruposConMacetas;
  }

  async obtenerMacetasDeGrupo(idPersona: string, idHogar: string, idGrupo: string) {
    const macetasRef = collection(this.db, `Personas/${idPersona}/Hogares/${idHogar}/Grupos/${idGrupo}/Macetas`);
    const macetasSnap = await getDocs(macetasRef);
    return macetasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}
