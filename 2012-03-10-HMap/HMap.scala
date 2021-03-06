
import java.net.URI

import org.scalacheck._
import org.scalacheck.Arbitrary._
import org.scalacheck.Prop._
import org.scalacheck.Pretty._

// A heterogeneous collection is a sort of general idea of having
// a Set or Map or List where the elements may have different types.
// I am generally not a fan of pretending these are all that closely
// related to a homogeneous collection, but they certainly can be
// useful structures. But their usefulness does not come from the
// ability to "just toss anything in there" like you might think if you
// come from a dynamically-typed scripting language. You can already
// simulate that in Scala/Java by casting to/from object, and it is easy
// and lightweight.
//
// No, the benefit is recovering some of the type information that you lose
// when you treat everything as Object/AnyRef.
//
// Let me get started and demonstrate a heterogeneous map.
// Instead of Map[Key, Value] as you would normally have in Scala,
// I embed the type of the value _into the key_: HMap[TypedKey]
// Scala has some rather idiosyncratic ways of writing higher-kinded
// types, but here is the definition of the trait:

trait HMap[TypedKey[_]] { self =>
  def get[T](key: TypedKey[T]) : Option[T]
  def put[T](key: TypedKey[T], value: T) : HMap[TypedKey]
}

// For this essay I will just use a default implementation layered directly on the
// existing type of maps and use casting under the hood.

object HMap {
  private class WrappedMap[TypedKey[_]](underlyingMap: Map[TypedKey[_], AnyRef]) extends HMap[TypedKey] {
    def get[T](key: TypedKey[T]) = underlyingMap.get(key).asInstanceOf[Option[T]]
    def put[T](key: TypedKey[T], value: T) = new WrappedMap(underlyingMap + (key -> value.asInstanceOf[AnyRef]))
  }

  def empty[TypedKey[_]] : HMap[TypedKey] = new WrappedMap[TypedKey](Map())
}

// At this point I cannot really do anything, because I do not have a type for the keys. Let me just make one up quick in an interactive session to demonstrate:
//
// xsbt console
//
// scala> case class TInt[T](i: Int)
// defined class TInt
//
// scala> val m = HMap.empty[TInt]
// m: HMap[TInt] = HMap$WrappedMap@67bcdb3f
//
// scala> m.put(TInt[String](3), "hello")
// res0: HMap[TInt] = HMap$WrappedMap@13216ee9
//
// scala> m.put(TInt[Int](3), "goodbye")
// <console>:11: error: type mismatch;
//  found   : TInt[Int]
//  required: TInt[Any]
// Note: Int <: Any, but class TInt is invariant in type T.
// You may wish to define T as +T instead. (SLS 4.5)
//               m.put(TInt[Int](3), "goodbye")
//                              ^
//
// scala> m1.get(TInt[String](3))
// res2: Option[String] = Some(hello)
//
// scala> m1.get(TInt[String](5))
// res3: Option[String] = None
//
// scala> m1.get(TInt[Int](3))
// res4: Option[Int] = None !!!!!! does not work


// Things to note: The type paramter of TInt has to match from key to value.
// The type parameter is also compile-time only. A good compiler can eliminate the boxing/unboxing,
// in general. There is probably some object-oriented reason why Scala is not allowed to, but I didn't check
// the bytecode.

// Now the thing I did with TInt is a well-known pattern called "WithPhantom Types" (which you should googld)
// so I will define a general phantom-type-augmented value. It is basically as simple
// as "case class WithWithPhantom[T, WithPhantomT](v: T)" but there are some wrinkles surrounding equality.
// Are values with different phantom types equal? I say no, but getting Java & Scala to agree with
// me was not that easy.
//
// I would love suggestions on improving these bits. Direct them to the actual github project
// that came of this: https://github.com/kennknowles/scala-heterogeneous-map

case class WithPhantom[T, Phantom: Manifest](v: T) {
  private val m = implicitly[Manifest[Phantom]]

  override def equals(other: Any) = other.isInstanceOf[WithPhantom[T, Phantom]] && {
    val otherPh = other.asInstanceOf[WithPhantom[T, Phantom]]
    (otherPh.m.erasure == this.m.erasure) && (otherPh.v == this.v)
  }

  override def hashCode = (v, implicitly[Manifest[Phantom]].hashCode).hashCode
  
  override def toString = "WithPhantom[%s](%s)".format(implicitly[Manifest[Phantom]].erasure.getName, v)
}

// Now we can use this to have TInt, TString, and my favorite: TURI

object WithPhantom {
  type TInt[T] = WithPhantom[Int, T]
  type TString[T] = WithPhantom[String, T]
  type TURI[T] = WithPhantom[URI, T]

  def TInt[T: Manifest](i: Int) = WithPhantom[Int, T](i)
  def TString[T: Manifest](str: String) = WithPhantom[String, T](str)
  def TURI[T: Manifest](uri: URI) = WithPhantom[URI, T](uri)
}

// It is fun and all to play around in the scala console, but to make this robust, small as it is,
// I'll use scalacheck properties. For that, I will need Gen and Arbitrary values for WithPhantom
// and HMap. This is somewhat problematic because to have an arbitrary HMap I need to
// choose arbitrary types which is another discussion entirely. So for these properties,
// I just use two types and request that the invoker of the functions ensure that they
// are different if needed.

// Also hairy is that I could not get Scalac to have a non-divergent inference
// of Arbitrary[HMap[T]] so the Gen[HMap] value must be passed explicitly to forAll

object ScalaCheckInstances {

  implicit def arbWithPhantom[T: Arbitrary, Phantom: Manifest] : Arbitrary[WithPhantom[T, Phantom]] = Arbitrary(for(v <- arbitrary[T]) yield WithPhantom[T, Phantom](v))

  def genHMap[Value1, Value2, TypedKey[_]](implicit arbV1: Arbitrary[Value1], arbV2: Arbitrary[Value2], arbK1: Arbitrary[TypedKey[Value1]], arbK2: Arbitrary[TypedKey[Value2]]) : Gen[HMap[TypedKey]] = {
    for {
      kv1List <- arbitrary[List[(TypedKey[Value1], Value1)]]
      kv2List <- arbitrary[List[(TypedKey[Value2], Value2)]]
    } yield {
      var hmap = HMap.empty[TypedKey]
      for ((k, v) <- kv1List) { hmap = hmap.put(k, v) }
      for ((k, v) <- kv2List) { hmap = hmap.put(k, v) }
      hmap
    }
  }

  // For arbitrary, I just choose Int and String as the two phantom types and TInt for the key
  implicit def arbHMap[TypedKey[_]](implicit arbKInt: Arbitrary[TypedKey[Int]], arbKString: Arbitrary[TypedKey[String]]) = Arbitrary(genHMap[Int, String, TypedKey])
}

// The most important test is that WithPhantom[Int, Int](x) != WithPhantom[Int, String](x) because that is
// the code I was least confident in.

object WithPhantomProperties extends Properties("WithPhantom") { 

  // Types must be unequal
  def prop_typeMiss[T, Value1: Manifest, Value2: Manifest](x: T) : Prop =
    WithPhantom[T, Value1](x) != WithPhantom[T, Value2](x)

  property("typeMiss") = forAll { x:Int => prop_typeMiss[Int, Boolean, String](x) }
}

// xsbt console
//
// WithPhantomProperties.check
// + WithPhantom.typeMiss: OK, passed 100 tests.

// And then the spec for HMap is more-or-less the same as the spec for map,
// but we add an extra check to make sure that lookups in the map for inequal types
// also miss.

object HMapProperties extends Properties("HMap") { 
  import ScalaCheckInstances._
  import WithPhantom._ // for TInt, etc

  def prop_empty[TypedKey[_], T](x: TypedKey[T]) : Prop = 
    HMap.empty.get(x) ?= None

  def prop_hit[TypedKey[_], T](m: HMap[TypedKey], x: TypedKey[T], v: T) : Prop = 
    m.put(x, v).get(x) ?= Some(v)

  def prop_miss[TypedKey[_], T](m: HMap[TypedKey], x: TypedKey[T], y: TypedKey[T], v: T) : Prop = 
    { (x != y) ==> (m.put(y, v).get(x) ?= m.get(x)) }
    
  // When x == y but T != U
  def prop_typeMiss[TypedKey[_], T, U](m: HMap[TypedKey], x: TypedKey[T], y: TypedKey[U], v: U) : Prop = {
    m.put(y, v).get(x) ?= m.get(x)
  }

  property("empty") = forAll { x:TInt[Int] => prop_empty(x) }

  property("hit") = forAll { (m:HMap[TInt], x: TInt[Int], v: Int) => prop_hit(m, x, v) }
  
  property("miss") = forAll { (m:HMap[TInt], x: TInt[Int], y: TInt[Int], v: Int) => prop_miss(m, x, y, v) }
  
  property("typeMiss") = forAll { (m:HMap[TInt], x: Int, v: Boolean) => prop_typeMiss(m, 
                                                                                      WithPhantom[Int, Int](x).asInstanceOf[TInt[Int]], 
                                                                                      WithPhantom[Int, Boolean](x).asInstanceOf[TInt[Boolean]], 
                                                                                      v) }
}

// All the checks pass! I do have some lingering doubts about equality and hashcodes.

// I'm not claiming novelty of idea or implementation; I have simply bothered to write these thoughts up
// as an exercise for myself and hopefully entertainment for you. Here are some other references to similar ideas:
//
//  * http://thread.gmane.org/gmane.comp.lang.scala/12629
//  * http://scala-programming-language.1934581.n4.nabble.com/differently-typed-values-in-Map-td1942540.html
//  * http://scala-programming-language.1934581.n4.nabble.com/scala-Interesting-use-for-existential-types-td1991961.html
